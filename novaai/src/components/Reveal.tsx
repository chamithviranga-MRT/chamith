import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';

type RevealProps = {
  /** Element to render. Defaults to a div. */
  as?: ElementType;
  /** transition-delay in ms, applied per element for staggered entrances. */
  delay?: number;
  className?: string;
  children?: ReactNode;
  'aria-hidden'?: boolean;
};

const HIDDEN = 'translate-y-8 opacity-0';
const VISIBLE = 'translate-y-0 opacity-100';

/**
 * Fade-up on enter: IntersectionObserver at threshold 0.15, 700ms ease-out,
 * with a per-element transition-delay.
 */
export default function Reveal({
  as: Tag = 'div',
  delay = 0,
  className = '',
  children,
  ...rest
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { threshold: 0.15 },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const Component = Tag as ElementType;

  return (
    <Component
      {...rest}
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out will-change-transform ${
        visible ? VISIBLE : HIDDEN
      } ${className}`}
    >
      {children}
    </Component>
  );
}
