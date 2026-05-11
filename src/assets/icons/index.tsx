import type { CSSProperties } from 'react';
import brandMark from '@/assets/images/brand-mark.svg';

interface LogoSmallProps {
  style?: CSSProperties;
  className?: string;
}

const LogoSmall = ({ style, className }: LogoSmallProps) => (
  <img src={brandMark} alt="" width={40} height={40} className={className} style={{ display: 'block', ...style }} />
);

export { LogoSmall };
