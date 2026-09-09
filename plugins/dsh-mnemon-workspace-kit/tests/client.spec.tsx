// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { MemorySourcePageProps, MnemonSourceManagementClient } from 'dsh-mnemon/client'
import { createCollectionPage } from '../src/client.tsx'
vi.mock('dsh-mnemon/client', () => ({ MemorySourcePageFrame: ({children}: {children:ReactNode}) => children }))
afterEach(cleanup)
const record = (title: string) => ({ id:title, title, content:'', kind:'note', scope:'project', workspaceId:'/project', state:'active', data:{}, signals:1,version:1,history:[],createdAt:'2026-09-09T00:00:00Z',updatedAt:'2026-09-09T00:00:00Z' })
const result = (title: string) => ({revision:title,value:{revision:title,records:[record(title)]}})
const Page=createCollectionPage({title:{en:'Records','zh-CN':'记录'},description:{en:'Scoped','zh-CN':'范围'},kinds:[{value:'note',label:{en:'Note','zh-CN':'笔记'}}],scopes:['project'],defaultScope:'project'})
const props = (client:MnemonSourceManagementClient,workspaceId:string):MemorySourcePageProps => ({sourceTypeId:'notes',sourceInstanceKey:client.sourceInstanceKey,sourceInstances:[],management:client,locale:'en',writable:true,workspaceId})
it('rejects a late snapshot after the selected workspace changes', async () => {
  let finish!:(value:unknown)=>void
  const first={sourceInstanceKey:'source:notes',revision:'first',read:vi.fn(()=>new Promise(resolve=>{finish=resolve})),mutate:vi.fn()} as unknown as MnemonSourceManagementClient
  const second={...first,read:vi.fn(async()=>result('Second workspace'))} as unknown as MnemonSourceManagementClient
  const view=render(<Page {...props(first,'/first')} />)
  view.rerender(<Page {...props(second,'/second')} />)
  await screen.findByRole('heading',{name:'Second workspace'})
  await act(async()=>{finish(result('First workspace'))})
  expect(screen.queryByRole('heading',{name:'First workspace'})).toBeNull()
})
it('drops an old pending save and draft without resetting the new workspace', async () => {
  let finish!:(value:unknown)=>void
  const first={sourceInstanceKey:'source:notes',revision:'first',read:vi.fn(async()=>result('First')),mutate:vi.fn(()=>new Promise(resolve=>{finish=resolve}))} as unknown as MnemonSourceManagementClient
  const second={...first,read:vi.fn(async()=>result('Second'))} as unknown as MnemonSourceManagementClient
  const view=render(<Page {...props(first,'/first')} />);await screen.findByRole('heading',{name:'First'})
  fireEvent.click(screen.getByRole('button',{name:'Edit'}));fireEvent.change(screen.getByRole('textbox',{name:'Title'}),{target:{value:'Old draft'}});fireEvent.click(screen.getByRole('button',{name:'Save'}))
  await waitFor(()=>expect(first.mutate).toHaveBeenCalledOnce())
  view.rerender(<Page {...props(second,'/second')} />);await screen.findByRole('heading',{name:'Second'})
  await act(async()=>{finish(result('Old saved'))})
  expect(screen.queryByRole('textbox',{name:'Title'})).toBeNull();expect(screen.queryByRole('heading',{name:'Old saved'})).toBeNull()
  expect(screen.queryByRole('status')).toBeNull()
})
