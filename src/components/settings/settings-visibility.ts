export function settingsSections(canManageOwnAiSettings:boolean){return ['appearance','reading',...(canManageOwnAiSettings?['ai']:[])];}
