'use client';
import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isPreference, type Preference } from './core.ts';
import { useI18n } from './react.tsx';
export function LanguagePicker({ className }: { className?: string } = {}) {
 const { t, locale, preference } = useI18n(), router = useRouter(), statusID = useId();
 const [selected, setSelected] = useState<Preference>(preference), [previous, setPrevious] = useState(preference);
 const [pending, setPending] = useState(false), [failed, setFailed] = useState(false);
 if (previous !== preference) { setPrevious(preference); setSelected(preference); }
 return <div className={className || 'webdock-language-picker'} data-locale={locale} aria-busy={pending}>
  <label><span>{t('Language')}</span><select value={selected} disabled={pending} aria-describedby={pending || failed ? statusID : undefined} onChange={async event => {
   const value = event.target.value;
   if (!isPreference(value)) return;
   setSelected(value); setPending(true); setFailed(false);
   try {
    const response = await fetch('/api/locale', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preference: value }) });
    if (response.status !== 204) throw new Error('Locale preference was rejected.');
    router.refresh();
   } catch { setSelected(preference); setFailed(true); }
   finally { setPending(false); }
  }}><option value="system">{t('System')}</option><option value="en">English</option><option value="de">Deutsch</option></select></label>
  {failed ? <p id={statusID} role="alert">{t('Could not change language. Please try again.')}</p> : pending ? <span id={statusID} role="status">{t('Changing language…')}</span> : null}
 </div>;
}
