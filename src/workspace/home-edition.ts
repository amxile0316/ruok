import type {EditProject} from '@/types'
import '@/workspace/publish-home.css'
export const homeHasKoubo = true
export const loadHomeEditorProjects = () => Promise.resolve([] as EditProject[])
