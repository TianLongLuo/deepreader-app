import * as React from 'react';
import {cn} from '@/lib/utils';
export function IconButton({className,type='button',...props}:React.ButtonHTMLAttributes<HTMLButtonElement>&{'aria-label':string}){return <button type={type} {...props} className={cn('inline-flex h-9 min-w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40 disabled:pointer-events-none',className)}/>;}
