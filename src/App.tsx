// Modified by the RUOK fork on 2026-11-17: rebranded to RUOK and removed the upstream Pro upgrade route/dialog.
import {GeneralRunWatcher} from './general/GeneralRunWatcher';
import {RouteLoadBoundary} from './workspace/RouteLoadBoundary';
import {ClientUpdate} from './standard/ClientUpdate';
import {Routes,Route,Link,useLocation} from 'react-router';
import {Toaster} from 'sonner';
import GeneralEdit from './pages/GeneralEdit';
import GeneralProject from './pages/GeneralProject';
import StyleLibraryPage from './pages/StyleLibraryPage';
import Screen from './pages/OpenScreenWorkspace';
import Home from './pages/WorkspaceHome';
import StudioProjects from './pages/StudioProjects';
import {WorkspaceNavigation} from './workspace/WorkspaceNavigation';
import {WorkspaceNavigationProvider} from './workspace/navigation-guard';
import {StandardAbout} from './settings/edition';
export default function App(){const {pathname}=useLocation();return <WorkspaceNavigationProvider><ClientUpdate/><WorkspaceNavigation/><GeneralRunWatcher/><div className="workspace-content"><RouteLoadBoundary key={pathname}><Routes><Route path="/" element={<Home/>}/><Route path="/general" element={<GeneralEdit/>}/><Route path="/general/projects/:id" element={<GeneralProject/>}/><Route path="/styles" element={<StyleLibraryPage/>}/><Route path="/studio" element={<StudioProjects/>}/><Route path="/screen-motion" element={<StudioProjects/>}/><Route path="/screen-motion/projects/:id" element={<Screen/>}/><Route path="/about" element={<div className="system-settings"><main><StandardAbout/></main></div>}/><Route path="*" element={<main className="workspace-dashboard"><h1>页面不存在</h1><Link to="/">返回首页</Link></main>}/></Routes></RouteLoadBoundary></div><Toaster theme="dark" richColors position="top-center"/></WorkspaceNavigationProvider>}
