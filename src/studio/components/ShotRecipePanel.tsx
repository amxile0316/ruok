// Added by the RUOK fork on 2026-11-21: 剪辑台 hostbar 的「镜头配方」入口。
import {useEffect, useRef, useState} from 'react'
import {Check, Clapperboard, Copy} from 'lucide-react'
import {copyText} from '@/workspace/clipboard'
import {SHOT_RECIPES, SHOT_RECIPE_ATTRIBUTION, shotRecipeBrief} from '../shot-recipes'
import './shot-recipes.css'

/** 只做展示和复制：配方进 Agent 的对话，剪辑台本身的渲染链路不动。 */
export function ShotRecipePanel() {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState('')
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape) }
  }, [open])

  const copy = async (key: string, text: string) => {
    const ok = await copyText(text)
    setCopied(ok ? key : `${key}:fail`)
    window.setTimeout(() => setCopied(''), 1800)
  }

  return <div className="shot-recipes" ref={root}>
    <button type="button" className="shot-recipes__trigger" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(value => !value)}>
      <Clapperboard size={15} />镜头配方
    </button>
    {open && <div className="shot-recipes__panel" role="dialog" aria-label="镜头配方">
      <header className="shot-recipes__head">
        <b>镜头配方</b>
        <button type="button" className="shot-recipes__all" onClick={() => void copy('all', SHOT_RECIPES.map(shotRecipeBrief).join('\n\n'))}>
          <Copy size={13} />全部复制
        </button>
      </header>
      <p className="shot-recipes__hint">复制后粘到剪辑台的 Agent 对话里，让它按这张配方做这一段。</p>
      <ul className="shot-recipes__list">
        {SHOT_RECIPES.map(recipe => <li key={recipe.id}>
          <div className="shot-recipes__title">
            <span>{recipe.name}</span>
            <button type="button" className="shot-recipes__copy" onClick={() => void copy(recipe.id, shotRecipeBrief(recipe))}>
              {copied === recipe.id ? <><Check size={13} />已复制</> : <><Copy size={13} />复制</>}
            </button>
          </div>
          <p className="shot-recipes__line">{recipe.oneLine}</p>
          <p className="shot-recipes__when">用在：{recipe.when}</p>
          {copied === `${recipe.id}:fail` && <p className="shot-recipes__fail" role="alert">复制失败，请手动选中文字复制。</p>}
        </li>)}
      </ul>
      <footer className="shot-recipes__foot">{SHOT_RECIPE_ATTRIBUTION}</footer>
    </div>}
  </div>
}
