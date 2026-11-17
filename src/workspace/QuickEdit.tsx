// Modified by the RUOK fork on 2026-11-17: the RUOK talk editor replaces the upstream Pro intake.
import {Link} from 'react-router'
import {ChevronRight} from 'lucide-react'
import type {QuickEditActivity} from './QuickEditLive'
export function QuickEdit(_props: {onActivity: (activity: QuickEditActivity | null) => void}) {
  return <div className="home-intake__intro">
    <h2>口播剪辑</h2>
    <p>按逐字稿切口播：删掉静音和口误，导出 SRT、VTT 与剪切清单。素材只在本机读取时长，不上传。</p>
    <Link className="home-entry__button" to="/talk">打开口播剪辑<ChevronRight size={16} aria-hidden="true" /></Link>
  </div>
}
