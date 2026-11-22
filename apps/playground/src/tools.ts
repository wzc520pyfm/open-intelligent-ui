import type { PromptTool } from "@open-intelligent-ui/core/prompt"

export interface Ticket {
  id: string
  subject: string
  customer: string
  priority: "low" | "normal" | "urgent"
  status: "open" | "pending" | "solved"
  assignee: string | null
  /** Seconds since the customer last heard from us. */
  waiting: number
  body: string
}

const SEED: Ticket[] = [
  { id: "T-1042", subject: "Invoices export fails with a timeout", customer: "Northwind", priority: "urgent", status: "open", assignee: "Mina", waiting: 5400, body: "Exporting more than 500 invoices to CSV spins for a minute and then fails. Started after Tuesday's release." },
  { id: "T-1041", subject: "Can't invite teammates on the Team plan", customer: "Lumen Labs", priority: "normal", status: "open", assignee: null, waiting: 12600, body: "The invite button is greyed out even though we have two seats left." },
  { id: "T-1039", subject: "SSO login loops back to the sign-in page", customer: "Atlas Freight", priority: "urgent", status: "open", assignee: "Jonas", waiting: 2100, body: "Okta users are redirected back to sign-in after authenticating. Password login still works." },
  { id: "T-1036", subject: "Question about annual billing", customer: "Pine & Co", priority: "low", status: "open", assignee: null, waiting: 86400, body: "Do we get a discount if we switch from monthly to annual in the middle of a cycle?" },
  { id: "T-1033", subject: "Webhook retries arrive out of order", customer: "Kestrel", priority: "normal", status: "pending", assignee: "Priya", waiting: 172800, body: "We asked for request IDs for the affected deliveries and are waiting to hear back." },
  { id: "T-1030", subject: "Dark mode charts are unreadable", customer: "Lumen Labs", priority: "low", status: "pending", assignee: "Mina", waiting: 259200, body: "Fix is in review. Asked the customer to confirm on the preview build." },
  { id: "T-1027", subject: "Refund for duplicate charge", customer: "Harbor Books", priority: "normal", status: "solved", assignee: "Jonas", waiting: 0, body: "Refunded the duplicate charge of $49 and confirmed by email." },
  { id: "T-1021", subject: "API key rotation", customer: "Northwind", priority: "normal", status: "solved", assignee: "Priya", waiting: 0, body: "Walked the customer through rotating keys without downtime." },
]

function delay<T>(value: T, ms = 350): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] as number
}

/**
 * An in-memory ticket system standing in for a real backend. The generated
 * workbench reads and writes it through these tools, never through the agent.
 */
export function createTicketTools(latency = 350) {
  let tickets = SEED.map((ticket) => ({ ...ticket }))
  let next = 1043

  return {
    listTickets: (input: unknown) => {
      const { status, search } = (input ?? {}) as { status?: string; search?: string }
      const query = (search ?? "").trim().toLowerCase()
      const rows = tickets
        .filter((ticket) => !status || ticket.status === status)
        .filter(
          (ticket) =>
            !query ||
            ticket.subject.toLowerCase().includes(query) ||
            ticket.customer.toLowerCase().includes(query)
        )
        .sort(
          (a, b) =>
            Number(b.priority === "urgent") - Number(a.priority === "urgent") ||
            b.waiting - a.waiting
        )
      return delay(rows.map((ticket) => ({ ...ticket })), latency)
    },
    ticketStats: () => {
      const open = tickets.filter((ticket) => ticket.status === "open")
      return delay(
        {
          open: open.length,
          urgent: open.filter((ticket) => ticket.priority === "urgent").length,
          medianWait: median(open.map((ticket) => ticket.waiting)),
        },
        latency
      )
    },
    createTicket: (input: unknown) => {
      const { subject, customer, priority } = (input ?? {}) as Partial<Ticket>
      if (!subject?.trim()) throw new Error("A ticket needs a subject")
      const ticket: Ticket = {
        id: `T-${next++}`,
        subject: subject.trim(),
        customer: customer?.trim() || "Unknown",
        priority: priority ?? "normal",
        status: "open",
        assignee: null,
        waiting: 60,
        body: "Created from the workbench.",
      }
      tickets = [ticket, ...tickets]
      return delay({ ...ticket }, latency)
    },
    updateTicket: (input: unknown) => {
      const { id, ...changes } = (input ?? {}) as Partial<Ticket> & { id?: string }
      const ticket = tickets.find((item) => item.id === id)
      if (!ticket) throw new Error(`No ticket ${String(id)}`)
      if (changes.status) ticket.status = changes.status
      if (changes.assignee !== undefined) ticket.assignee = changes.assignee
      if (changes.priority) ticket.priority = changes.priority
      if (ticket.status === "solved") ticket.waiting = 0
      return delay({ ...ticket }, latency)
    },
  }
}

/** The same tools, described for the model. */
export const TICKET_TOOLS: PromptTool[] = [
  {
    name: "listTickets",
    kind: "read",
    description: "Support tickets, most urgent first.",
    input: '{ status?: "open" | "pending" | "solved", search?: string }',
    output:
      'A list of { id, subject, customer, priority: "low" | "normal" | "urgent", status, assignee: string | null, waiting: seconds, body }',
  },
  {
    name: "ticketStats",
    kind: "read",
    description: "Counts for the open queue.",
    output: "{ open: number, urgent: number, medianWait: seconds }",
  },
  {
    name: "createTicket",
    kind: "write",
    description: "Creates an open ticket and returns it.",
    input: '{ subject: string, customer?: string, priority?: "low" | "normal" | "urgent" }',
  },
  {
    name: "updateTicket",
    kind: "write",
    description: "Changes a ticket's status, assignee or priority and returns it.",
    input: '{ id: string, status?: "open" | "pending" | "solved", assignee?: string | null, priority?: string }',
  },
]
