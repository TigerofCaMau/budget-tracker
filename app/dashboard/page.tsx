"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, SubmitHandler } from "react-hook-form";
import { supabase } from "@/lib/supabaseClient";
import { Bar, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
import styles from "./Dashboard.module.css";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend
);

type Expense = {
  id: string;
  user_id?: string;
  title: string;
  amount: number;
  category: string;
  date: string;
  notes?: string | null;
  created_at?: string;
};

type ExpenseFormValues = {
  title: string;
  amount: number;
  category: string;
  date: string;
  notes: string;
};

const centerTextPlugin = {
  id: "centerText",
  afterDraw: (chart: any) => {
    const {
      ctx,
      chartArea: { top, bottom, left, right, width, height },
    } = chart;
    ctx.save();

    // Calculate the total from the data
    const total = chart.data.datasets[0].data.reduce(
      (a: number, b: number) => a + b,
      0
    );
    const formattedTotal = `$${total.toLocaleString()}`;

    ctx.font = "bold 2rem sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#2d3748";

    // Position text in the dead center
    ctx.fillText(formattedTotal, left + width / 2, top + height / 2);
    ctx.restore();
  },
};

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loadingExpenses, setLoadingExpenses] = useState<boolean>(false);
  const [expensesError, setExpensesError] = useState<string | null>(null);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [openMonth, setOpenMonth] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const router = useRouter();
  const totalSpent = expenses.reduce((sum, exp) => sum + exp.amount, 0);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseFormValues>();

  // Check session once
  useEffect(() => {
    async function checkUser() {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.push("/login");
      } else {
        setUser(data.user);
        fetchExpenses(data.user);
      }
    }
    checkUser();

    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [router]);

  // Show loading while user is fetched
  if (!user) return <p>Loading...</p>;

  // Logout function
  async function handleLogOut() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  // Fetch expenses
  async function fetchExpenses(currentUser = user) {
    if (!currentUser) return alert("No user logged in");

    setLoadingExpenses(true);
    setExpensesError(null);

    const { data, error } = await supabase
      .from("expenses")
      .select("*")
      .eq("user_id", currentUser.id)
      .order("date", { ascending: false });

    if (error) {
      setExpensesError(error.message);
    } else {
      setExpenses(data || []);
    }

    setLoadingExpenses(false);
  }

  // Delete expense handler
  async function handleDeleteExpense(id: string) {
    const { error } = await supabase.from("expenses").delete().eq("id", id);

    if (error) {
      alert("Error deleting expense: " + error.message);
    } else {
      fetchExpenses();
    }
  }

  // Handle form submit (add or edit)
  const onSubmit = async (data: ExpenseFormValues) => {
    if (!user) return alert("No user logged in");

    const { title, amount, category, date, notes } = data;
    const numericAmount = Number(amount);

    try {
      if (editingExpenseId) {
        // 1. Update existing expense
        const { error } = await supabase
          .from("expenses")
          .update({
            title,
            amount: numericAmount,
            category,
            date,
            notes,
          })
          .eq("id", editingExpenseId);

        if (error) throw error;
        setToast("Expense updated successfully!");
      } else {
        // 2. Add new expense using standard Insert
        const { error } = await supabase.from("expenses").insert([
          {
            title,
            amount: numericAmount,
            category,
            date,
            notes,
            user_id: user.id, // Ensure you attach the user ID here!
          },
        ]);

        if (error) throw error;
        setToast("Expense added successfully!");
      }

      // 3. Shared Cleanup & Feedback
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setToast(null), 3000);

      // Refresh data and reset the UI state
      await fetchExpenses();
      setEditingExpenseId(null);

      // reset to empty/default state
      reset({
        title: "",
        amount: 0,
        category: "",
        date: new Date().toISOString().split("T")[0], // Optional: reset date to today
        notes: "",
      });
    } catch (error: any) {
      console.error("Submission Error:", error);
      alert("Error: " + error.message);
    }
  };

  // Search and filter function
  const filteredExpenses = expenses.filter((exp) => {
    if (!searchTerm) return true;

    const text = searchTerm.toLowerCase();

    return (
      exp.title.toLowerCase().includes(text) ||
      exp.category.toLowerCase().includes(text) ||
      exp.notes?.toLowerCase().includes(text) ||
      false
    );
  });

  // Group expenses by category
  const expensesByCategory: {
    [category: string]: { display: string; items: Expense[] };
  } = {};

  filteredExpenses.forEach((exp) => {
    const normalized = exp.category.toLowerCase();
    if (!expensesByCategory[normalized]) {
      expensesByCategory[normalized] = { display: exp.category, items: [] };
    }
    expensesByCategory[normalized].items.push(exp);
  });

  // Sort each category array by date
  Object.values(expensesByCategory).forEach((cat) => {
    cat.items.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  });

  const sortedCategories = Object.values(expensesByCategory).sort((a, b) =>
    a.display.toLocaleLowerCase().localeCompare(b.display.toLocaleLowerCase())
  );

  // Group expenses by month
  const expensesByMonth: {
    [month: string]: {
      [category: string]: Expense[];
    };
  } = {};

  filteredExpenses.forEach((exp) => {
    const monthLabel = new Date(exp.date).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });

    // Create month if it doesn't exist
    if (!expensesByMonth[monthLabel]) {
      expensesByMonth[monthLabel] = {};
    }

    const categoryKey = exp.category.toLocaleLowerCase();

    // Create category if that month does not exist
    if (!expensesByMonth[monthLabel][categoryKey]) {
      expensesByMonth[monthLabel][categoryKey] = [];
    }

    // Push expense
    expensesByMonth[monthLabel][categoryKey].push(exp);
  });

  // Sort months newest → oldest
  const sortedMonths = Object.keys(expensesByMonth)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
    .map((label) => ({
      label,
      categories: expensesByMonth[label],
    }));

  // Monthly totals
  const monthlyTotals: { [month: string]: number } = {};

  expenses.forEach((exp) => {
    const monthLabel = new Date(exp.date).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });

    if (!monthlyTotals[monthLabel]) {
      monthlyTotals[monthLabel] = 0;
    }

    monthlyTotals[monthLabel] += exp.amount;
  });

  // Convert into chart format
  const monthLabels = Object.keys(monthlyTotals);
  const monthValues = Object.values(monthlyTotals);

  // Monthly chart data
  const monthlyChartData = {
    labels: monthLabels,
    datasets: [
      {
        label: "Monthly Spending",
        data: monthValues,
        backgroundColor: "#3182ce",
      },
    ],
  };

  // Pie chart
  const categoryLabels = Object.values(expensesByCategory).map(
    (cat) => cat.display
  );
  const categoryAmounts = Object.values(expensesByCategory).map((cat) =>
    cat.items.reduce((sum, exp) => sum + exp.amount, 0)
  );

  const pieChartData = {
    labels: categoryLabels,
    datasets: [
      {
        label: "Spending by Category",
        data: categoryAmounts,
        backgroundColor: [
          "#FF6384",
          "#36A2EB",
          "#FFCE56",
          "#4BC0C0",
          "#9966FF",
          "#FF9F40",
        ],
        borderWidth: 1,
      },
    ],
  };

  return (
    <main className={styles.container}>
      <div className={styles.headerRow}>
        <h1>Dashboard</h1>
        <p>Welcome, {user.email}</p>

        <button onClick={handleLogOut} className={styles.logoutBtn}>
          Logout
        </button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className={styles.form}>
        <h2 className={styles.sectionTitle}>Add Expense</h2>

        <input
          placeholder="Title"
          {...register("title", { required: true })}
          className={styles.formInput}
        />
        <input
          placeholder="Amount"
          type="number"
          {...register("amount", { required: true, valueAsNumber: true })}
          className={styles.formInput}
        />
        <input
          placeholder="Category"
          {...register("category", { required: true })}
          className={styles.formInput}
        />
        <input
          placeholder="Date"
          type="date"
          {...register("date", { required: true })}
          className={styles.formInput}
        />
        <textarea
          placeholder="Notes"
          {...register("notes")}
          className={styles.textarea}
        />

        <button
          type="submit"
          disabled={isSubmitting}
          className={styles.submitBtn}
        >
          {isSubmitting ? "Saving..." : "Add Expense"}
        </button>
      </form>

      <input
        placeholder="Search expenses..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className={styles.searchInput}
      />

      {/* Charts */}
      <div className={styles.chartWrapper}>
        <div className={styles.chartContainer}>
          <h2 className={styles.chartTitle}>Monthly Spending</h2>
          {monthLabels.length > 0 ? (
            <Bar
              data={monthlyChartData}
              options={{
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                  legend: { position: "bottom" },
                },
              }}
            />
          ) : (
            <p>No expenses yet</p>
          )}
        </div>

        <div className={styles.chartContainer}>
          <h2 className={styles.chartTitle}>By Category</h2>
          {categoryLabels.length > 0 ? (
            <Doughnut
              data={pieChartData}
              plugins={[centerTextPlugin]}
              options={{
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 2,
                cutout: "75%",
                plugins: {
                  legend: { position: "bottom" },
                  tooltip: {
                    callbacks: {
                      label: (context) => {
                        const value = context.parsed;
                        const total = context.dataset.data.reduce(
                          (a, b) => a + b,
                          0
                        );
                        const percentage = ((value / total) * 100).toFixed(1);
                        return `${
                          context.label
                        }: $${value.toLocaleString()} (${percentage}%)`;
                      },
                    },
                  },
                },
              }}
            />
          ) : (
            <p>No data available</p>
          )}
        </div>
      </div>

      {!loadingExpenses && expenses.length > 0 && (
        <h3 className={styles.totalText}>
          Total spent:{" "}
          {totalSpent.toLocaleString("en-US", {
            style: "currency",
            currency: "USD",
          })}
        </h3>
      )}

      {/* Loading expenses message */}
      {loadingExpenses && <p>Loading expenses...</p>}

      {/* Error message */}
      {expensesError && <p style={{ color: "red" }}>{expensesError}</p>}

      {/* Empty state */}
      {!loadingExpenses && expenses.length === 0 && <p>No expenses yet</p>}

      {/* Map over expenses to render each item in categories */}
      {sortedMonths.map((month) => {
        const monthTotal = Object.values(month.categories)
          .flat()
          .reduce((sum, exp) => sum + exp.amount, 0);

        return (
          <div key={month.label} className={styles.monthBlock}>
            <h2
              onClick={() =>
                setOpenMonth(openMonth === month.label ? null : month.label)
              }
              className={styles.monthHeader}
            >
              {openMonth === month.label ? "▾" : "▸"} {month.label}
            </h2>

            <p style={{ fontWeight: "bold" }}>
              Total:{" "}
              {monthTotal.toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
              })}
            </p>

            {openMonth === month.label && (
              <>
                {Object.entries(month.categories).map(
                  ([categoryKey, items]) => {
                    const categoryTotal = items.reduce(
                      (sum, exp) => sum + exp.amount,
                      0
                    );

                    return (
                      <div key={categoryKey} className={styles.categoryGroup}>
                        <div className={styles.categoryHeader}>
                          <span>{items[0].category}</span>
                          <span>
                            {categoryTotal.toLocaleString("en-US", {
                              style: "currency",
                              currency: "USD",
                            })}
                          </span>
                        </div>

                        {items.map((exp) => {
                          const isEditing = editingExpenseId === exp.id;

                          return (
                            <div
                              key={exp.id}
                              className={`${styles.transactionRow} ${
                                isEditing ? styles.editingRow : ""
                              }`}
                            >
                              <div
                                className={styles.fadeEntry}
                                style={{ display: "contents" }}
                              >
                                {isEditing ? (
                                  /* EDIT MODE: Mini-form inside the row */
                                  <form
                                    className={styles.inlineForm}
                                    onSubmit={handleSubmit(onSubmit)}
                                  >
                                    <input
                                      {...register("title")}
                                      defaultValue={exp.title}
                                      className={styles.inlineInput}
                                    />
                                    <input
                                      {...register("amount", {
                                        valueAsNumber: true,
                                      })}
                                      defaultValue={exp.amount}
                                      type="number"
                                      className={styles.inlineInput}
                                    />
                                    <input
                                      {...register("date")}
                                      defaultValue={exp.date}
                                      type="date"
                                      className={styles.inlineInput}
                                    />

                                    <div className={styles.actionsContainer}>
                                      <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className={`${styles.actionBtn} ${
                                          styles.saveBtn
                                        } ${
                                          isSubmitting ? styles.btnLoading : ""
                                        }`}
                                      >
                                        {isSubmitting ? (
                                          <>
                                            <span
                                              className={styles.spinner}
                                            ></span>
                                            Saving...
                                          </>
                                        ) : (
                                          "Save"
                                        )}
                                      </button>

                                      <button
                                        type="button"
                                        disabled={isSubmitting}
                                        onClick={() => {
                                          setEditingExpenseId(null);
                                          reset({
                                            title: "",
                                            amount: 0,
                                            category: "",
                                            date: new Date()
                                              .toISOString()
                                              .split("T")[0],
                                            notes: "",
                                          });
                                        }}
                                        className={`${styles.actionBtn} ${styles.cancelBtn}`}
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </form>
                                ) : (
                                  /* VIEW MODE: Normal Row */
                                  <>
                                    <div>
                                      <strong>{exp.title}</strong>
                                      {exp.notes && (
                                        <p className={styles.dateText}>
                                          {exp.notes}
                                        </p>
                                      )}
                                    </div>
                                    <div className={styles.amountText}>
                                      {exp.amount.toLocaleString("en-US", {
                                        style: "currency",
                                        currency: "USD",
                                      })}
                                    </div>
                                    <div className={styles.dateText}>
                                      {new Date(exp.date).toLocaleDateString(
                                        "en-US",
                                        { month: "short", day: "numeric" }
                                      )}
                                    </div>
                                    <div className={styles.actionsContainer}>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingExpenseId(exp.id);
                                          reset({
                                            ...exp,
                                            notes: exp.notes ?? "", // If notes is null or undefined, use an empty string
                                          });
                                        }}
                                        className={`${styles.actionBtn} ${styles.editBtn}`}
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          handleDeleteExpense(exp.id)
                                        }
                                        className={`${styles.actionBtn} ${styles.deleteBtn}`}
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }
                )}
              </>
            )}
          </div>
        );
      })}
      {toast && (
        <div className={styles.toast}>
          <span>{toast}</span>
          <button
            className={styles.closeToast}
            onClick={() => setToast(null)}
            aria-label="Close notification"
          >
            &times;
          </button>
        </div>
      )}
    </main>
  );
}
