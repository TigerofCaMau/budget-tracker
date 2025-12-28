'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, SubmitHandler } from 'react-hook-form'
import { supabase } from '@/lib/supabaseClient'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend
} from 'chart.js'
import styles from './Dashboard.module.css'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

type Expense = {
  id: string;
  user_id?: string;
  title: string;
  amount: number;
  category: string;
  date: string;
  notes?: string | null;
  created_at?: string;
}

type ExpenseFormValues = {
  title: string
  amount: number
  category: string
  date: string
  notes: string
}

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loadingExpenses, setLoadingExpenses] = useState<boolean>(false)
  const [expensesError, setExpensesError] = useState<string | null>(null)
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)
  const [openMonth, setOpenMonth] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  const router = useRouter()
  const totalSpent = expenses.reduce((sum, exp) => sum + exp.amount, 0)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting }
  } = useForm<ExpenseFormValues>()

  // Check session once
  useEffect(() => {
    async function checkUser() {
      const { data } = await supabase.auth.getUser()
      if (!data.user) {
        router.push('/login')
      } else {
        setUser(data.user)
        fetchExpenses(data.user)
      }
    }

    checkUser()
  }, [router])

  // Show loading while user is fetched
  if (!user) return <p>Loading...</p>

  // Logout function
  async function handleLogOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Fetch expenses
  async function fetchExpenses(currentUser = user) {
    if (!currentUser) return alert ('No user logged in')

    setLoadingExpenses(true)
    setExpensesError(null)

    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_id', currentUser.id)
      .order('date', { ascending: false })

    if (error) {
      setExpensesError(error.message)
    } else {
      setExpenses(data || [])
    }

    setLoadingExpenses(false)
  }

  // Delete expense handler
  async function handleDeleteExpense(id : string) {
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', id)
    
    if (error) {
      alert('Error deleting expense: ' + error.message)
    } else {
      fetchExpenses()
    }
  }

  // Handle form submit (add or edit)
  const onSubmit = async (data: ExpenseFormValues) => {
    if(!user) return alert('No user logged in')

    const { title, amount, category, date, notes } = data

    if (editingExpenseId) {
      // Update existing expense
      const { error } = await supabase
        .from('expenses')
        .update({
          title,
          amount,
          category,
          date,
          notes
        })
        .eq('id', editingExpenseId)
        
      if (error) return alert('Error updating expense: ' + error.message)
      
      alert('Expense updated!')
      setEditingExpenseId(null)
    } else {
      // Add new expense using RPC
      const { error } = await supabase.rpc('add_expense', {
        p_title: title,
        p_amount: Number(amount),
        p_category: category,
        p_date: date,
        p_notes: notes
      })

      if (error) return alert('Error updating expense: ' + error.message)
    }

    // Refresh the list
    await fetchExpenses()

    // Reset the form
    reset()
  }

  // Search and filter function
  const filteredExpenses = expenses.filter(exp => {
    if (!searchTerm) return true

    const text = searchTerm.toLowerCase()

    return (
      exp.title.toLowerCase().includes(text) ||
      exp.category.toLowerCase().includes(text) ||
      (exp.notes?.toLowerCase().includes(text) || false)
    )
  })

  // Group expenses by category
  const expensesByCategory: { [category: string]: { display: string; items: Expense[] } } = {}

  filteredExpenses.forEach(exp => {
    const normalized = exp.category.toLowerCase()
    if (!expensesByCategory[normalized]) {
      expensesByCategory[normalized] = { display: exp.category, items: [] }
    }
    expensesByCategory[normalized].items.push(exp)
  })

  // Sort each category array by date
  Object.values(expensesByCategory).forEach(cat => {
    cat.items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  })

  const sortedCategories = Object.values(expensesByCategory)
    .sort((a, b) => a.display
    .toLocaleLowerCase()
    .localeCompare(b.display
    .toLocaleLowerCase())
  )

  // Group expenses by month
  const expensesByMonth: { 
    [month: string]: {
      [category: string]: Expense[]
    }
  } = {}

  filteredExpenses.forEach(exp => {
    const monthLabel = new Date(exp.date).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric'
    })

    // Create month if it doesn't exist
    if (!expensesByMonth[monthLabel]) {
      expensesByMonth[monthLabel] = {}
    }

    const categoryKey = exp.category.toLocaleLowerCase()

    // Create category if that month does not exist
    if (!expensesByMonth[monthLabel][categoryKey]) {
      expensesByMonth[monthLabel][categoryKey] = []
    }
  
    // Push expense
    expensesByMonth[monthLabel][categoryKey].push(exp)
  })

  // Sort months newest → oldest
  const sortedMonths = Object.keys(expensesByMonth)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
    .map(label => ({
      label,
      categories: expensesByMonth[label]
  }))

  // Monthly totals
  const monthlyTotals: { [month: string]: number } = {}

  expenses.forEach(exp => {
    const monthLabel = new Date(exp.date).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric'
    })

    if (!monthlyTotals[monthLabel]) {
      monthlyTotals[monthLabel] = 0
    }

    monthlyTotals[monthLabel] += exp.amount
  })

  // Convert into chart format
  const monthLabels = Object.keys(monthlyTotals)
  const monthValues = Object.values(monthlyTotals)

  // Monthly chart data
  const monthlyChartData = {
    labels: monthLabels,
    datasets: [
      {
        label: 'Monthly Spending',
        data: monthValues,
        backgroundColor: '#3182ce'
      }
    ]
  }

  return (
    <main className={styles.container}>
      <div className={styles.headerRow}>
        <h1>Dashboard</h1>
        <p>Welcome, {user.email}</p>

        <button
          onClick={handleLogOut}
          className={styles.logoutBtn}
        >
          Logout
        </button>
      </div>

      <h2 className={styles.sectionTitle}>Add Expense</h2>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className={styles.form}
      >
        <input
          placeholder="Title"
          {...register('title', { required: true })}
        />
        {errors.title && (
          <p style={{ color: 'red' }}>{errors.title.message}</p>
        )}
        <input
          placeholder="Amount"
          type="number"
          {...register('amount', { required: true, valueAsNumber: true })}
        />
        {errors.title && (
          <p style={{ color: 'red' }}>{errors.title.message}</p>
        )}
        <input
          placeholder="Category"
          {...register('category', { required: true })}
        />
        {errors.title && (
          <p style={{ color: 'red' }}>{errors.title.message}</p>
        )}
        <input
          placeholder="Date"
          type="date"
          {...register('date', { required: true })}
        />
        {errors.title && (
          <p style={{ color: 'red' }}>{errors.title.message}</p>
        )}
        <textarea
          placeholder="Notes"
          {...register('notes')}
          />
        <button
          type="submit"
          disabled={isSubmitting}
          className={styles.submitBtn}
        >
          {isSubmitting
            ? 'Saving...'
            : editingExpenseId
            ? 'Update Expense'
            : 'Add Expense'}
        </button>

        {/* Cancel edit */}
          {editingExpenseId && (
            <button
              type="button"
              onClick={() => {
                setEditingExpenseId(null)
                reset()
              }}
              className={styles.cancelBtn}
            >
              Cancel Edit
            </button>
          )}
      </form>

      <input
        placeholder="Search expenses..."
        value={searchTerm}        
        onChange={(e) => setSearchTerm(e.target.value)}
        className={styles.searchInput}
      />

      {/* Charts */}
      <div className={styles.chartWrapper}>
        <h2 style={{ marginTop: 40 }}>Monthly Spending</h2>
        
        {monthLabels.length > 0 ?  (
          <div style={{ maxWidth: 600 }}>
            <Bar
              data={monthlyChartData}
              options={{
                responsive: true,
                plugins: {
                  legend: { display: false }
                }
              }}
            />
          </div>
        ) : (
          <p>No expenses yet</p>
        )}
      </div>

      {!loadingExpenses && expenses.length > 0 && (
        <h3 className={styles.totalText}>
          Total spent: {totalSpent.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
        </h3>
      )}

      {/* Loading expenses message */}
      {loadingExpenses && <p>Loading expenses...</p>}

      {/* Error message */}
      {expensesError && <p style={{ color: 'red' }} >{expensesError}</p>}

      {/* Empty state */}
      {!loadingExpenses && expenses.length === 0 && <p>No expenses yet</p>}

      {/* Map over expenses to render each item in categories */}
      {sortedMonths.map(month => {
        const monthTotal = Object.values(month.categories)
          .flat()
          .reduce((sum, exp) => sum + exp.amount, 0)

        return (
          <div
            key={month.label}
            className={styles.monthBlock}
          >
            <h2
              onClick={() =>
                setOpenMonth(openMonth === month.label ? null : month.label)
              }
              className={styles.monthHeader}
            >
              {openMonth === month.label ? '▾' : '▸'} {month.label}
            </h2>

            <p style={{ fontWeight: 'bold' }}>
              Total:{' '}
              {monthTotal.toLocaleString('en-US', {
                style: 'currency',
                currency: 'USD'
              })}
            </p>

            {openMonth === month.label && (
              <>
                {Object.entries(month.categories).map(([categoryKey, items]) => {
                  const categoryTotal = items.reduce(
                    (sum, exp) => sum + exp.amount,
                    0
                  )

                  return (
                    <div
                      key={categoryKey}
                      className={styles.categoryBlock}
                    >
                      <h3>
                        {items[0].category} —{' '}
                        {categoryTotal.toLocaleString('en-US', {
                          style: 'currency',
                          currency: 'USD'
                        })}
                      </h3>

                      {items.map(exp => (
                        <div
                          key={exp.id}
                          className={styles.expenseCard}
                        >
                          <p>
                            <strong>{exp.title}</strong> —{' '}
                            {exp.amount.toLocaleString('en-US', {
                              style: 'currency',
                              currency: 'USD'
                            })}
                          </p>

                          <p>
                            Date:{' '}
                            {new Date(exp.date).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}
                          </p>

                          {exp.notes && <p>Notes: {exp.notes}</p>}

                          <button
                            onClick={() => handleDeleteExpense(exp.id)}
                            className={`${styles.actionBtn} ${styles.deleteBtn}`}
                          >
                            Delete
                          </button>

                          <button
                            onClick={() => {
                              setEditingExpenseId(exp.id)
                              reset({
                                title: exp.title,
                                amount: exp.amount,
                                category: exp.category,
                                date: exp.date,
                                notes: exp.notes || ''
                              })
                            }}
                            className={`${styles.actionBtn} ${styles.editBtn}`}
                          >
                            Edit
                          </button>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </>
            )}
          </div>
        )
      })}
    </main>
  )
}
