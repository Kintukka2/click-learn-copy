// CONTRACT (implemented by the capture/replay workstream): scripted demo recordings against the
// bundled Northwind ERP demo app, so the whole pipeline can run headlessly without a human.
export interface ScriptedAction {
  action: "click" | "type" | "select" | "check" | "press";
  /** Playwright locator description, e.g. { role: "button", name: "Save" } or { label: "Customer name" } or { css: "#x" }. */
  locator: { role?: string; name?: string; label?: string; css?: string; text?: string; testid?: string };
  value?: string;
}

export interface DemoScenario {
  id: string;
  title: string;
  chapter: string;
  description: string;
  /** Path relative to the server root, e.g. "/demo-erp/#/customers". */
  startPath: string;
  actions: ScriptedAction[];
}

const click = (role: string, name: string): ScriptedAction => ({ action: "click", locator: { role, name } });
const type = (label: string, value: string): ScriptedAction => ({ action: "type", locator: { label }, value });
const select = (label: string, value: string): ScriptedAction => ({ action: "select", locator: { label }, value });

export const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: "create-customer",
    title: "Create a new customer",
    chapter: "Sales",
    description: "Register a new customer with address, contact details and credit terms so you can start selling to them.",
    startPath: "/demo-erp/#/customers?reset=1&lang=en",
    actions: [
      click("button", "New"),
      type("Name", "Fjord Kontormøbler ApS"),
      type("Address", "Strandvejen 60"),
      type("Post Code", "2900"),
      type("City", "Hellerup"),
      select("Country/Region", "Denmark"),
      type("E-mail", "indkob@fjordkontor.dk"),
      type("Credit Limit (LCY)", "75000"),
      { action: "check", locator: { label: "Tax Liable" }, value: "true" },
      click("button", "Save"),
    ],
  },
  {
    id: "create-sales-order",
    title: "Create and post a sales order",
    chapter: "Sales",
    description: "Enter a sales order for an existing customer, add item lines and post the order so it is shipped and invoiced.",
    startPath: "/demo-erp/#/sales-orders?reset=1&lang=en",
    actions: [
      click("button", "New"),
      select("Customer Name", "Odense Designhus A/S"),
      type("External Document No.", "ODH-2210"),
      click("button", "Add line"),
      { action: "select", locator: { css: "#line-1-item" }, value: "ATHENS Desk" },
      { action: "type", locator: { css: "#line-1-qty" }, value: "6" },
      click("button", "Add line"),
      { action: "select", locator: { css: "#line-2-item" }, value: "AMSTERDAM Lamp" },
      { action: "type", locator: { css: "#line-2-qty" }, value: "6" },
      click("button", "Post"),
      click("button", "Yes"),
    ],
  },
  {
    id: "approve-purchase-invoice",
    title: "Approve a purchase invoice",
    chapter: "Finance",
    description: "Review a vendor invoice that is waiting for your approval, add an approval comment and approve it for posting.",
    startPath: "/demo-erp/#/home?reset=1&lang=en",
    actions: [
      click("link", "Purchase Invoices"),
      click("link", "PI-1004"),
      click("button", "Approve"),
      type("Comment", "Checked against goods receipt GR-3381."),
      click("button", "OK"),
    ],
  },
  {
    id: "add-item",
    title: "Add a new item",
    chapter: "Inventory",
    description: "Create an item card with category, prices and a reorder point so the item can be sold and purchased.",
    startPath: "/demo-erp/#/items?reset=1&lang=en",
    actions: [
      click("button", "New"),
      type("Description", "OSLO Standing Desk"),
      select("Item Category", "Desks"),
      type("Reorder Point", "4"),
      type("Unit Price", "7450"),
      type("Unit Cost", "4800"),
      click("button", "Save"),
    ],
  },
  {
    id: "update-credit-limit",
    title: "Change a customer's credit limit",
    chapter: "Sales",
    description: "Find a customer in the customer list and raise their credit limit after a credit review.",
    startPath: "/demo-erp/#/customers?reset=1&lang=en",
    actions: [
      { action: "type", locator: { css: "#list-search" }, value: "Müller" },
      click("link", "C00040"),
      type("Credit Limit (LCY)", "450000"),
      click("button", "Save"),
    ],
  },
];
