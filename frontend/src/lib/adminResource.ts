import { useCallback, useEffect, useReducer, useRef } from 'react'
import { api } from '@/lib/api'

export type AdminResourceStatus =
  | 'loading'
  | 'ready'
  | 'empty'
  | 'partial'
  | 'stale'
  | 'error'
type Metadata = {
  asOf: string
  coverage: 'complete' | 'partial' | 'unavailable'
}
export interface AdminResource<T> {
  status: AdminResourceStatus
  data: T | null
  refreshing: boolean
}
type ResourceAction<T> =
  | { type: 'start' | 'failure' | 'reset' }
  | { type: 'success'; data: T; empty: boolean }
export function initialAdminResource<T>(): AdminResource<T> {
  return { status: 'loading', data: null, refreshing: false }
}
export function reduceAdminResource<T extends Metadata>(
  state: AdminResource<T>,
  action: ResourceAction<T>,
): AdminResource<T> {
  switch (action.type) {
    case 'reset':
      return initialAdminResource<T>()
    case 'start':
      return { ...state, refreshing: true }
    case 'failure':
      return {
        ...state,
        status: state.data ? 'stale' : 'error',
        refreshing: false,
      }
    case 'success':
      return {
        data: action.data,
        refreshing: false,
        status:
          action.data.coverage !== 'complete'
            ? 'partial'
            : action.empty
              ? 'empty'
              : 'ready',
      }
  }
}

/** A snapshot belongs to one exact query. Late responses cannot overwrite a newer query. */
export function useAdminResource<T extends Metadata>(
  path: string,
  isEmpty: (data: T) => boolean,
) {
  const [state, dispatch] = useReducer(
    reduceAdminResource<T>,
    initialAdminResource<T>(),
  )
  const generation = useRef(0)
  const statePath = useRef(path)
  const emptyRef = useRef(isEmpty)
  emptyRef.current = isEmpty
  const refresh = useCallback(async () => {
    const request = ++generation.current
    dispatch({ type: 'start' })
    try {
      const data = await api.admin.get<T>(path)
      if (request === generation.current)
        dispatch({ type: 'success', data, empty: emptyRef.current(data) })
    } catch {
      if (request === generation.current) dispatch({ type: 'failure' })
    }
  }, [path])
  useEffect(() => {
    statePath.current = path
    dispatch({ type: 'reset' })
    void refresh()
    return () => {
      generation.current++
    }
  }, [path, refresh])
  return {
    ...(statePath.current === path ? state : initialAdminResource<T>()),
    refresh,
  }
}
