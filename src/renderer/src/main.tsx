import { createRoot } from 'react-dom/client'
import { App } from './App'
import './style.css'
import './workspace.css'
import { audio } from './audio'
window.editor.onStopAudio(()=>audio.stop())
createRoot(document.getElementById('root')!).render(<App/>)
