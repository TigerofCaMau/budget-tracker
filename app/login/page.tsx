'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      alert(error.message)
      return
    }

    // Login succeeded → redirect to dashboard
    router.push('/dashboard')
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Login</h1>

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <div>
          <label>Email</label>
          <br />
          <input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div>
          <label>Password</label>
          <br />
          <input
            type="password"
            placeholder="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button
          type="submit"
          style={{
            padding: '10px 16px',
            backgroundColor: '#3182ce',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
          }}
        >
          Log in
        </button>
      </form>
    </main>
  )
}
