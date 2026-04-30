import type { EntityType } from '../lib/types';

export default function EntityPicker({ value, onChange }: { value: EntityType; onChange: (v: EntityType) => void }) {
  return (
    <div className="entity-picker">
      <button className={value === 'contact' ? 'active' : ''} onClick={() => onChange('contact')}>👤 Contacts</button>
      <button className={value === 'company' ? 'active' : ''} onClick={() => onChange('company')}>🏢 Companies</button>
    </div>
  );
}
