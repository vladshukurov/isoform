import { createRoot } from 'react-dom/client';
import { Tooltip } from '../ui/Tooltip';
import { Design } from './Design';
import '../styles/index.css';
import './design.css';

createRoot(document.getElementById('root')!).render(<><Design /><Tooltip /></>);
