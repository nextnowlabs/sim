import { Suspense } from 'react'
import type { Metadata } from 'next'
import { Files } from '../files'

export const metadata: Metadata = {
  title: '文件',
  robots: { index: false },
}

export default function FilesFilePage() {
  return (
    <Suspense fallback={null}>
      <Files />
    </Suspense>
  )
}
