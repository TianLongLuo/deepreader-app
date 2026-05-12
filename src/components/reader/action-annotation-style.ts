export type ActionSlotRole =
  | 'actor_modifier'
  | 'actor_core'
  | 'action_modifier'
  | 'action_core'
  | 'target_modifier'
  | 'target_core';

type ActionAnnotationStyle = {
  label: string;
  textColor: string;
  fontWeight: string;
  underlineEnabled: boolean;
  underlineColor: string;
  underlineThickness: string;
  underlineStyle: 'solid' | 'dotted';
  className: string;
  epubCssTextColor: string;
};

export const ACTION_ANNOTATION_STYLE_MAP: Record<ActionSlotRole, ActionAnnotationStyle> = {
  actor_modifier: {
    label: 'Subject modifier',
    textColor: '#78716c',
    fontWeight: '500',
    underlineEnabled: false,
    underlineColor: '#a8a29e',
    underlineThickness: '1.7px',
    underlineStyle: 'dotted',
    className: 'text-stone-600 dark:text-stone-400',
    epubCssTextColor: '#78716c',
  },
  actor_core: {
    label: 'Subject',
    textColor: '#92400e',
    fontWeight: '650',
    underlineEnabled: true,
    underlineColor: '#f59e0b',
    underlineThickness: '2.6px',
    underlineStyle: 'solid',
    className: 'text-amber-800 decoration-amber-500 dark:text-amber-300',
    epubCssTextColor: '#92400e',
  },
  action_modifier: {
    label: 'Verb modifier',
    textColor: '#78716c',
    fontWeight: '500',
    underlineEnabled: false,
    underlineColor: '#a8a29e',
    underlineThickness: '1.7px',
    underlineStyle: 'dotted',
    className: 'text-stone-600 dark:text-stone-400',
    epubCssTextColor: '#78716c',
  },
  action_core: {
    label: 'Verb',
    textColor: '#047857',
    fontWeight: '650',
    underlineEnabled: true,
    underlineColor: '#10b981',
    underlineThickness: '2.6px',
    underlineStyle: 'solid',
    className: 'text-emerald-700 decoration-emerald-500 dark:text-emerald-300',
    epubCssTextColor: '#047857',
  },
  target_modifier: {
    label: 'Predicate modifier',
    textColor: '#78716c',
    fontWeight: '500',
    underlineEnabled: false,
    underlineColor: '#a8a29e',
    underlineThickness: '1.7px',
    underlineStyle: 'dotted',
    className: 'text-stone-600 dark:text-stone-400',
    epubCssTextColor: '#78716c',
  },
  target_core: {
    label: 'Predicate',
    textColor: '#4338ca',
    fontWeight: '650',
    underlineEnabled: true,
    underlineColor: '#818cf8',
    underlineThickness: '2.6px',
    underlineStyle: 'solid',
    className: 'text-indigo-700 decoration-indigo-400 dark:text-indigo-300',
    epubCssTextColor: '#4338ca',
  },
};

export function getActionAnnotationStyle(role: ActionSlotRole) {
  return ACTION_ANNOTATION_STYLE_MAP[role];
}

export function getActionAnnotationClassName(role: ActionSlotRole) {
  const style = getActionAnnotationStyle(role);

  return [
    'cursor-help',
    style.fontWeight === '650' ? 'font-semibold' : 'font-medium',
    'transition-colors',
    ...(style.underlineEnabled
      ? [
          'underline',
          'underline-offset-4',
          style.underlineStyle === 'dotted'
            ? 'decoration-dotted'
            : 'decoration-solid',
          style.underlineThickness === '2.6px'
            ? 'decoration-[2.6px]'
            : 'decoration-[1.7px]',
        ]
      : []),
    style.className,
  ].join(' ');
}

export function getSentenceRoleActionSlotRole(role: string): ActionSlotRole {
  switch (role) {
    case 'subject':
      return 'actor_core';
    case 'verb':
      return 'action_core';
    case 'modifier':
      return 'target_modifier';
    case 'object':
    case 'clause':
    case 'phrase':
    case 'other':
    default:
      return 'target_core';
  }
}
