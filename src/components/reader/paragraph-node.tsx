'use client';

import { ElementRef, useRef, useEffect } from 'react';
import useSWR from 'swr';
import { cn } from '@/lib/utils';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  getActionAnnotationClassName,
  getActionAnnotationStyle,
} from './action-annotation-style';
import { getActionAnnotationSlots } from './action-annotation-slots';

interface ParagraphNodeProps {
  paragraph: any;
  isActive: boolean;
  onClick: () => void;
}

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function ParagraphNode({ paragraph, isActive, onClick }: ParagraphNodeProps) {
  const ref = useRef<ElementRef<"div">>(null);

  // If active, we might want to fetch its explanation spans to highlight the text natively here.
  const { data: explanationData } = useSWR(
    isActive ? `/api/paragraphs/${paragraph.id}/explanation` : null,
    fetcher
  );

  useEffect(() => {
    if (isActive && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isActive]);

  const renderText = () => {
    const sourceText = paragraph.normalizedText || paragraph.rawText;
    const spans = getActionAnnotationSlots(explanationData?.output, sourceText);
    
    if (!isActive || !spans || spans.length === 0) {
      return <span>{paragraph.rawText}</span>;
    }

    // Advanced: slice text by offsets and wrap in hover tooltips.
    // Simplifying here to just show how it connects.
    let lastIndex = 0;
    const elements: React.ReactNode[] = [];
    
    spans.forEach((span, idx) => {
      // Add un-annotated text before span
      if (span.start_offset > lastIndex) {
        elements.push(
          <span key={`text-${idx}`}>{sourceText.substring(lastIndex, span.start_offset)}</span>
        );
      }

      const style = getActionAnnotationStyle(span.role);

      elements.push(
        <Tooltip.Provider key={`span-${idx}`}>
          <Tooltip.Root delayDuration={100}>
            <Tooltip.Trigger asChild>
              <span className={cn(getActionAnnotationClassName(span.role))}>
                {sourceText.substring(span.start_offset, span.end_offset) || span.text}
              </span>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content className="z-50 max-w-sm bg-popover text-popover-foreground border shadow-xl p-3 rounded-lg text-sm animate-in fade-in zoom-in-95">
                <div className="font-semibold text-xs uppercase tracking-wider mb-1 text-primary">{style.label}</div>
                <div>{span.text}</div>
                <Tooltip.Arrow className="fill-popover border-t" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
      );

      lastIndex = span.end_offset;
    });

    if (lastIndex < sourceText.length) {
      elements.push(
        <span key="text-end">{sourceText.substring(lastIndex)}</span>
      );
    }

    return elements;
  };

  return (
    <div 
      ref={ref}
      onClick={onClick}
      className={cn(
        "text-lg leading-relaxed cursor-pointer p-4 rounded-xl transition-all duration-300 ease-out border border-transparent",
        isActive ? "bg-background shadow-[0_4px_30px_rgba(0,0,0,0.05)] border-border ring-1 ring-primary/20" : "hover:bg-muted/50 text-foreground/90"
      )}
    >
      {renderText()}
    </div>
  );
}
