import { ICONS, type IconName } from './icons';

/** An interface glyph from `icons.ts`, sized to the text around it. */
export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return <i className={`icon ${className}`} aria-hidden dangerouslySetInnerHTML={{ __html: ICONS[name] }} />;
}
