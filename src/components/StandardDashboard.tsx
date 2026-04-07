import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckSquare, Square, Trash2, Plus, Search } from 'lucide-react';

interface StandardDashboardProps<T> {
  title: string;
  items: T[];
  selectedItems: Set<string>;
  onSelectItem: (id: string, checked: boolean) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onBulkDelete: () => void;
  filterText: string;
  onFilterChange: (text: string) => void;
  sortOrder: 'asc' | 'desc';
  onSortChange: (order: 'asc' | 'desc') => void;
  renderItem: (item: T) => React.ReactNode;
  getItemId: (item: T) => string;
  filterPlaceholder?: string;
  addButtonText?: string;
  onAddNew?: () => void;
  emptyStateIcon?: React.ReactNode;
  emptyStateText?: string;
}

export function StandardDashboard<T>({
  title,
  items,
  selectedItems,
  onSelectItem,
  onSelectAll,
  onDeselectAll,
  onBulkDelete,
  filterText,
  onFilterChange,
  sortOrder,
  onSortChange,
  renderItem,
  getItemId,
  filterPlaceholder = "Search...",
  addButtonText,
  onAddNew,
  emptyStateIcon,
  emptyStateText = "No items found"
}: StandardDashboardProps<T>) {
  const allSelected = items.length > 0 && selectedItems.size === items.length;
  
  return (
    <div className="p-6 space-y-6">
      {/* Header with bulk actions */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">{title}</h1>
        
        <div className="flex items-center gap-3">
          {/* Add new button */}
          {addButtonText && onAddNew && (
            <Button onClick={onAddNew} size="lg" className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold px-6 py-3 shadow-lg hover:shadow-xl transition-all">
              <Plus className="h-5 w-5 mr-2" />
              {addButtonText}
            </Button>
          )}
          
          {/* Bulk actions when items selected */}
          {selectedItems.size > 0 && (
            <>
              <span className="text-sm text-muted-foreground">
                {selectedItems.size} selected
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={onDeselectAll}
              >
                Clear Selection
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={onBulkDelete}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Selected ({selectedItems.size})
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filter and Sort Controls */}
      <div className="flex items-center gap-4">
        {/* Search/Filter */}
        <div className="flex items-center space-x-2 flex-1 min-w-[200px]">
          <Search className="w-4 h-4" />
          <Input
            placeholder={filterPlaceholder}
            value={filterText}
            onChange={(e) => onFilterChange(e.target.value)}
          />
        </div>
        
        {/* Sort Order */}
        <Select value={sortOrder} onValueChange={(v) => onSortChange(v as 'asc' | 'desc')}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="asc">A → Z</SelectItem>
            <SelectItem value="desc">Z → A</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Select All */}
      {items.length > 0 && (
        <div className="flex items-center gap-2 p-2 border-b">
          <Button
            variant="ghost"
            size="sm"
            onClick={allSelected ? onDeselectAll : onSelectAll}
            className="flex items-center gap-2"
          >
            {allSelected ? (
              <CheckSquare className="h-4 w-4" />
            ) : (
              <Square className="h-4 w-4" />
            )}
            {allSelected ? 'Deselect All' : 'Select All'}
          </Button>
          <span className="text-sm text-muted-foreground">
            {items.length} item(s)
          </span>
        </div>
      )}

      {/* Items List */}
      {items.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          {emptyStateIcon}
          <p className="text-lg mt-4">{emptyStateText}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => renderItem(item))}
        </div>
      )}
    </div>
  );
}
