import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Crash } from './ui/Crash';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(<Crash><App /></Crash>);
