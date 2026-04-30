import type { EntityType } from '../lib/types';

export default function EntityPicker({ value, onChange }: { value: EntityType; onChange: (v: EntityType) => void }) {
  return (
    <div className="entity-picker entity-picker-3">
      <button className={value === 'contact' ? 'active' : ''} onClick={() => onChange('contact')}>👤 Contacts</button>
      <button className={value === 'company' ? 'active' : ''} onClick={() => onChange('company')}>🏢 Companies</button>
      <button className={value === 'job'     ? 'active' : ''} onClick={() => onChange('job')}>💼 Jobs</button>
    </div>
  );
}
