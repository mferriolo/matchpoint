import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabase';
import { Plus, Edit, Trash2 } from 'lucide-react';

interface User {
  id: string;
  email: string;
  name: string;
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
  company?: string | null;
  role: string;
  status: string;
  last_login: string;
  created_at: string;
}

const UserManagement = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [newUser, setNewUser] = useState({ email: '', name: '', first_name: '', last_name: '', title: '', company: '', role: 'user' });

  const fetchUsers = async () => {
    const { data, error } = await supabase
      .from('admin_users')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (!error && data) {
      setUsers(data);
    }
    setLoading(false);
  };

  const createUser = async () => {
    // If first/last weren't typed, derive from full name so old code
    // paths still work; if Name is empty, build it from first/last.
    const built = { ...newUser };
    if (!built.first_name && built.name) built.first_name = built.name.split(' ')[0] || '';
    if (!built.last_name && built.name) built.last_name = built.name.split(' ').slice(1).join(' ') || '';
    if (!built.name && (built.first_name || built.last_name)) {
      built.name = [built.first_name, built.last_name].filter(Boolean).join(' ');
    }
    const { error } = await supabase
      .from('admin_users')
      .insert([built]);

    if (!error) {
      setNewUser({ email: '', name: '', first_name: '', last_name: '', title: '', company: '', role: 'user' });
      fetchUsers();
    }
  };

  const updateUser = async () => {
    if (!editUser) return;

    const updates = {
      name: editUser.name,
      first_name: editUser.first_name || null,
      last_name: editUser.last_name || null,
      title: editUser.title || null,
      company: editUser.company || null,
      role: editUser.role,
      status: editUser.status,
    };

    const { error } = await supabase
      .from('admin_users')
      .update(updates)
      .eq('id', editUser.id);

    if (!error) {
      setEditUser(null);
      fetchUsers();
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>User Management</CardTitle>
        <Dialog>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />Add User</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New User</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Email</Label>
                <Input
                  value={newUser.email}
                  onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>First Name</Label>
                  <Input
                    value={newUser.first_name}
                    onChange={(e) => setNewUser({...newUser, first_name: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Last Name</Label>
                  <Input
                    value={newUser.last_name}
                    onChange={(e) => setNewUser({...newUser, last_name: e.target.value})}
                  />
                </div>
              </div>
              <div>
                <Label>Title</Label>
                <Input
                  placeholder="e.g. Managing Partner"
                  value={newUser.title}
                  onChange={(e) => setNewUser({...newUser, title: e.target.value})}
                />
              </div>
              <div>
                <Label>Company</Label>
                <Input
                  placeholder="e.g. MedCentric"
                  value={newUser.company}
                  onChange={(e) => setNewUser({...newUser, company: e.target.value})}
                />
              </div>
              <div>
                <Label>Role</Label>
                <Select value={newUser.role} onValueChange={(value) => setNewUser({...newUser, role: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="user">User</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={createUser} className="w-full">Create User</Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{[user.first_name, user.last_name].filter(Boolean).join(' ').trim() || user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.title || <span className="text-gray-400">—</span>}</TableCell>
                <TableCell>{user.company || <span className="text-gray-400">—</span>}</TableCell>
                <TableCell>
                  <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                    {user.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={user.status === 'active' ? 'default' : 'destructive'}>
                    {user.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditUser(user)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      {/* Edit dialog. Open whenever editUser is set. */}
      <Dialog open={!!editUser} onOpenChange={open => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
          </DialogHeader>
          {editUser && (
            <div className="space-y-4">
              <div>
                <Label>Email</Label>
                <Input value={editUser.email} disabled />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>First Name</Label>
                  <Input
                    value={editUser.first_name || ''}
                    onChange={e => setEditUser({ ...editUser, first_name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Last Name</Label>
                  <Input
                    value={editUser.last_name || ''}
                    onChange={e => setEditUser({ ...editUser, last_name: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Display Name</Label>
                <Input
                  value={editUser.name || ''}
                  onChange={e => setEditUser({ ...editUser, name: e.target.value })}
                />
              </div>
              <div>
                <Label>Title</Label>
                <Input
                  placeholder="e.g. Managing Partner"
                  value={editUser.title || ''}
                  onChange={e => setEditUser({ ...editUser, title: e.target.value })}
                />
              </div>
              <div>
                <Label>Company</Label>
                <Input
                  placeholder="e.g. MedCentric"
                  value={editUser.company || ''}
                  onChange={e => setEditUser({ ...editUser, company: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Role</Label>
                  <Select value={editUser.role} onValueChange={value => setEditUser({ ...editUser, role: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="user">User</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={editUser.status} onValueChange={value => setEditUser({ ...editUser, status: value })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">active</SelectItem>
                      <SelectItem value="inactive">inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
                <Button onClick={updateUser}>Save</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default UserManagement;