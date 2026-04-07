import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Plus, Trash2, Edit2 } from 'lucide-react';
import { toast } from 'sonner';

interface MasterSkill {
  id: string;
  skill_name: string;
  category: string;
  profession: string | null;
  aliases: string[] | null;
  created_at: string;
}

export default function MasterSkillsManagement() {
  const [skills, setSkills] = useState<MasterSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    loadSkills();
  }, []);

  const loadSkills = async () => {
    try {
      const { data, error } = await supabase
        .from('master_skills')
        .select('*')
        .order('category', { ascending: true })
        .order('skill_name', { ascending: true });

      if (error) throw error;
      setSkills(data || []);
    } catch (error) {
      console.error('Error loading skills:', error);
      toast.error('Failed to load skills');
    } finally {
      setLoading(false);
    }
  };

  const categories = ['all', ...Array.from(new Set(skills.map(s => s.category)))];
  const professions = Array.from(new Set(skills.map(s => s.profession).filter(Boolean)));

  const filteredSkills = skills.filter(skill => {
    const matchesSearch = skill.skill_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (skill.aliases && skill.aliases.some(a => a.toLowerCase().includes(searchTerm.toLowerCase())));
    const matchesCategory = selectedCategory === 'all' || skill.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const universalSkills = filteredSkills.filter(s => !s.profession);
  const professionSkills = filteredSkills.filter(s => s.profession);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Master Skills Database</h2>
        <Badge variant="outline">{skills.length} Total Skills</Badge>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search skills or aliases..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
        <TabsList className="flex-wrap h-auto">
          {categories.map(cat => (
            <TabsTrigger key={cat} value={cat} className="capitalize">
              {cat === 'all' ? 'All Categories' : cat}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="text-center py-8">Loading skills...</div>
      ) : (
        <div className="space-y-6">
          {universalSkills.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Universal Skills ({universalSkills.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  {universalSkills.map(skill => (
                    <div key={skill.id} className="flex items-start justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium">{skill.skill_name}</div>
                        <div className="text-sm text-muted-foreground">{skill.category}</div>
                        {skill.aliases && skill.aliases.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {skill.aliases.map((alias, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {alias}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {professionSkills.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Profession-Specific Skills ({professionSkills.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  {professionSkills.map(skill => (
                    <div key={skill.id} className="flex items-start justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium">{skill.skill_name}</div>
                        <div className="text-sm text-muted-foreground">
                          {skill.category} • {skill.profession}
                        </div>
                        {skill.aliases && skill.aliases.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {skill.aliases.map((alias, i) => (
                              <Badge key={i} variant="secondary" className="text-xs">
                                {alias}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
