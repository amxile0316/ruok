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
import TalkPage from './talk/TalkPage';
import PublishPage from './publish/PublishPage';
import AnalyticsPage from './analytics/AnalyticsPage';
import TopicsPage from './topics/TopicsPage';
import ReaderPage from './reader/ReaderPage';
import MotionPage from './motion/MotionPage';
import {WorkspaceNavigation} from './workspace/WorkspaceNavigation';
import {WorkspaceNavigationProvider} from './workspace/navigation-guard';
import {StandardAbout} from './settings/edition';
export default function App(){const {pathname}=useLocation();return <WorkspaceNavigationProvider><ClientUpdate/><WorkspaceNavigation/><GeneralRunWatcher/><div className="workspace-content"><RouteLoadBoundary key={pathname}><Routes><Route path="/" element={<Home/>}/><Route path="/general" element={<GeneralEdit/>}/><Route path="/general/projects/:id" element={<GeneralProject/>}/><Route path="/styles" element={<StyleLibraryPage/>}/><Route path="/topics" element={<TopicsPage/>}/><Route path="/reader" element={<ReaderPage/>}/><Route path="/talk" element={<TalkPage/>}/><Route path="/motion" element={<MotionPage/>}/><Route path="/publish" element={<PublishPage/>}/><Route path="/analytics" element={<AnalyticsPage/>}/><Route path="/studio" element={<StudioProjects/>}/><Route path="/screen-motion" element={<StudioProjects/>}/><Route path="/screen-motion/projects/:id" element={<Screen/>}/><Route path="/about" element={<div className="system-settings"><main><StandardAbout/></main></div>}/><Route path="*" element={<main className="workspace-dashboard"><h1>页面不存在</h1><Link to="/">返回首页</Link></main>}/></Routes></RouteLoadBoundary></div><Toaster theme="dark" richColors position="top-center"/></WorkspaceNavigationProvider>}
