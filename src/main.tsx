import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import '@fontsource/barlow-semi-condensed/500.css'
import '@fontsource/barlow-semi-condensed/600.css'
import '@fontsource/barlow-semi-condensed/700.css'
import App from './App'
import './index.css'
import { readShared } from './share'

// a shared link (`?r=…`) opens its calculation
void readShared().then((shared) =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App shared={shared} />
    </StrictMode>,
  ),
)
