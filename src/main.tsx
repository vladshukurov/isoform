import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Crash } from './ui/Crash';
import './styles.css';

createRoot(document.getElementById('root')!).render(<Crash><App /></Crash>);
