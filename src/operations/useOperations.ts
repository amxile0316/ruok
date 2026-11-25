import {useCallback, useEffect, useRef, useState} from 'react'
import {createOperationsState, type OperationsState} from './model.ts'
import {loadOperations, saveOperations, type LoadOperationsResult, type OperationsStorageError} from './storage.ts'

export type OperationsOperationError = {code: 'operation'; message: string}
export type OperationsCommitError = OperationsStorageError | OperationsOperationError
export type OperationsCommitResult = {ok: true} | {ok: false; committed: boolean; error: OperationsCommitError}
export type OperationsUpdater = (state: OperationsState) => OperationsState

function readInitialOperations(): LoadOperationsResult {
  try {
    return loadOperations(window.localStorage)
  } catch {
    return {ok: false, error: {code: 'storage-read', message: '无法访问浏览器本地存储'}}
  }
}

/**
 * 发布与运营分析共用的本地运营状态。挂载只读；只有 commit 会写新键。
 * 新键读取失败时禁止提交，避免用空状态覆盖损坏数据。
 */
export function useOperations() {
  const [initial] = useState<LoadOperationsResult>(readInitialOperations)
  const [state, setState] = useState<OperationsState>(() => initial.ok ? initial.state : createOperationsState())
  const stateRef = useRef(state)
  const [saveError, setSaveError] = useState<OperationsStorageError | null>(null)
  const [operationError, setOperationError] = useState<OperationsOperationError | null>(null)
  const loadError = initial.ok ? null : initial.error

  // Only a valid legacy import may create the new key automatically; a damaged v1 key is never overwritten.
  useEffect(() => {
    if (!initial.ok || !initial.migrated) return
    try {
      const result = saveOperations(window.localStorage, initial.state)
      if (!result.ok) setSaveError(result.error)
    } catch {
      setSaveError({code: 'storage-write', message: '无法保存迁移后的运营数据'})
    }
  }, [initial])

  const commit = useCallback((updater: OperationsUpdater): OperationsCommitResult => {
    setOperationError(null)
    if (!initial.ok) return {ok: false, committed: false, error: initial.error}

    let next: OperationsState
    try {
      next = updater(stateRef.current)
    } catch (failure) {
      const error = {code: 'operation' as const, message: failure instanceof Error ? failure.message : String(failure)}
      setOperationError(error)
      return {ok: false, committed: false, error}
    }

    stateRef.current = next
    setState(next)

    let result: ReturnType<typeof saveOperations>
    try {
      result = saveOperations(window.localStorage, next)
    } catch {
      result = {ok: false, error: {code: 'storage-write', message: '无法访问浏览器本地存储'}}
    }
    if (!result.ok) {
      setSaveError(result.error)
      return {ok: false, committed: true, error: result.error}
    }
    setSaveError(null)
    return {ok: true}
  }, [initial])

  return {
    state,
    commit,
    loadError,
    saveError,
    operationError,
    migrated: initial.ok && initial.migrated,
    canCommit: initial.ok,
  }
}
