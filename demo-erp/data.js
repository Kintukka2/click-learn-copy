/* Northwind ERP: seed data (language-independent). Dates are relative to today's work date. */
(function () {
  "use strict";

  function day(offset) {
    var d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + offset);
    return d.toISOString().slice(0, 10);
  }

  function seed() {
    var customers = [
      { no: "C00010", name: "Nordlys Møbler A/S", address: "Vesterbrogade 112", postCode: "1620", city: "København V", country: "DK", contact: "Mette Kristensen", phone: "+45 33 12 45 78", email: "indkob@nordlys-mobler.dk", postingGroup: "DOMESTIC", paymentTerms: "30D", currency: "", creditLimit: 250000, taxLiable: true, blocked: "", balance: 84312.5 },
      { no: "C00020", name: "Aarhus Kontorinventar ApS", address: "Søndergade 41", postCode: "8000", city: "Aarhus C", country: "DK", contact: "Jesper Holm", phone: "+45 86 19 22 40", email: "jesper.holm@aarhus-kontor.dk", postingGroup: "DOMESTIC", paymentTerms: "14D", currency: "", creditLimit: 150000, taxLiable: true, blocked: "", balance: 23750 },
      { no: "C00030", name: "Odense Designhus A/S", address: "Kongensgade 18", postCode: "5000", city: "Odense C", country: "DK", contact: "Line Sørensen", phone: "+45 66 11 73 09", email: "line@odensedesignhus.dk", postingGroup: "DOMESTIC", paymentTerms: "30D", currency: "", creditLimit: 120000, taxLiable: true, blocked: "", balance: 0 },
      { no: "C00040", name: "Müller Büroeinrichtung GmbH", address: "Friedrichstraße 76", postCode: "10117", city: "Berlin", country: "DE", contact: "Thomas Müller", phone: "+49 30 2093 4410", email: "t.mueller@mueller-buero.de", postingGroup: "EU", paymentTerms: "30D", currency: "EUR", creditLimit: 400000, taxLiable: false, blocked: "", balance: 152880 },
      { no: "C00050", name: "Schneider & Söhne KG", address: "Königsallee 22", postCode: "40212", city: "Düsseldorf", country: "DE", contact: "Katrin Schneider", phone: "+49 211 8640 120", email: "einkauf@schneider-soehne.de", postingGroup: "EU", paymentTerms: "CM", currency: "EUR", creditLimit: 200000, taxLiable: false, blocked: "", balance: 41200 },
      { no: "C00060", name: "Hamburger Raumkonzepte GmbH", address: "Am Sandtorkai 5", postCode: "20457", city: "Hamburg", country: "DE", contact: "Jonas Petersen", phone: "+49 40 3290 7781", email: "j.petersen@raumkonzepte-hh.de", postingGroup: "EU", paymentTerms: "14D", currency: "EUR", creditLimit: 180000, taxLiable: false, blocked: "", balance: 9845 },
      { no: "C00070", name: "Thameside Office Supplies Ltd", address: "14 Southwark Street", postCode: "SE1 1RQ", city: "London", country: "GB", contact: "Oliver Bennett", phone: "+44 20 7946 0321", email: "orders@thameside-office.co.uk", postingGroup: "FOREIGN", paymentTerms: "30D", currency: "GBP", creditLimit: 300000, taxLiable: false, blocked: "", balance: 67420 },
      { no: "C00080", name: "Bristol Workspace Solutions Ltd", address: "3 Temple Quay", postCode: "BS1 6DZ", city: "Bristol", country: "GB", contact: "Charlotte Hughes", phone: "+44 117 496 0712", email: "c.hughes@bristolworkspace.co.uk", postingGroup: "FOREIGN", paymentTerms: "30D", currency: "GBP", creditLimit: 100000, taxLiable: false, blocked: "", balance: 0 },
      { no: "C00090", name: "Edinburgh Interiors plc", address: "27 George Street", postCode: "EH2 2PB", city: "Edinburgh", country: "GB", contact: "Fraser MacLeod", phone: "+44 131 496 0458", email: "purchasing@edinburgh-interiors.co.uk", postingGroup: "FOREIGN", paymentTerms: "CM", currency: "GBP", creditLimit: 175000, taxLiable: false, blocked: "", balance: 31560 },
      { no: "C00100", name: "Svensk Kontorsmiljö AB", address: "Drottninggatan 53", postCode: "111 21", city: "Stockholm", country: "SE", contact: "Erik Lindgren", phone: "+46 8 506 213 40", email: "erik.lindgren@kontorsmiljo.se", postingGroup: "EU", paymentTerms: "30D", currency: "SEK", creditLimit: 220000, taxLiable: false, blocked: "", balance: 18930 },
      { no: "C00110", name: "Rotterdam Werkplek B.V.", address: "Coolsingel 40", postCode: "3011 AD", city: "Rotterdam", country: "NL", contact: "Sanne de Vries", phone: "+31 10 799 4521", email: "inkoop@werkplek-rotterdam.nl", postingGroup: "EU", paymentTerms: "14D", currency: "EUR", creditLimit: 160000, taxLiable: false, blocked: "", balance: 5210 },
    ];

    var items = [
      { no: "1896-S", description: "ATHENS Desk", category: "DESK", uom: "PCS", unitPrice: 4950, unitCost: 3100, inventory: 18, reorderPoint: 5, vatGroup: "STANDARD", blocked: false },
      { no: "1900-S", description: "PARIS Guest Chair, black", category: "CHAIR", uom: "PCS", unitPrice: 1195, unitCost: 690, inventory: 42, reorderPoint: 10, vatGroup: "STANDARD", blocked: false },
      { no: "1906-S", description: "ATHENS Mobile Pedestal", category: "STORAGE", uom: "PCS", unitPrice: 2150, unitCost: 1240, inventory: 9, reorderPoint: 4, vatGroup: "STANDARD", blocked: false },
      { no: "1908-S", description: "LONDON Swivel Chair, blue", category: "CHAIR", uom: "PCS", unitPrice: 1890, unitCost: 1050, inventory: 27, reorderPoint: 8, vatGroup: "STANDARD", blocked: false },
      { no: "1920-S", description: "ANTWERP Conference Table", category: "TABLE", uom: "PCS", unitPrice: 8650, unitCost: 5200, inventory: 4, reorderPoint: 5, vatGroup: "STANDARD", blocked: false },
      { no: "1924-W", description: "CHAMONIX Base Storage Unit", category: "STORAGE", uom: "PCS", unitPrice: 2790, unitCost: 1610, inventory: 11, reorderPoint: 4, vatGroup: "STANDARD", blocked: false },
      { no: "1928-S", description: "AMSTERDAM Lamp", category: "LAMP", uom: "PCS", unitPrice: 645, unitCost: 310, inventory: 63, reorderPoint: 20, vatGroup: "STANDARD", blocked: false },
      { no: "1936-S", description: "BERLIN Guest Chair, yellow", category: "CHAIR", uom: "PCS", unitPrice: 1195, unitCost: 690, inventory: 2, reorderPoint: 10, vatGroup: "STANDARD", blocked: false },
      { no: "1960-S", description: "ROME Guest Chair, green", category: "CHAIR", uom: "PCS", unitPrice: 1195, unitCost: 690, inventory: 35, reorderPoint: 10, vatGroup: "STANDARD", blocked: false },
      { no: "1964-S", description: "TOKYO Guest Chair, blue", category: "CHAIR", uom: "PCS", unitPrice: 1195, unitCost: 690, inventory: 21, reorderPoint: 10, vatGroup: "STANDARD", blocked: false },
      { no: "1968-S", description: "MEXICO Swivel Chair, black", category: "CHAIR", uom: "PCS", unitPrice: 1890, unitCost: 1050, inventory: 16, reorderPoint: 8, vatGroup: "STANDARD", blocked: false },
      { no: "1972-S", description: "MUNICH Swivel Chair, yellow", category: "CHAIR", uom: "PCS", unitPrice: 1890, unitCost: 1050, inventory: 0, reorderPoint: 6, vatGroup: "STANDARD", blocked: true },
      { no: "1988-S", description: "SEOUL Guest Chair, red", category: "CHAIR", uom: "PCS", unitPrice: 1195, unitCost: 690, inventory: 30, reorderPoint: 10, vatGroup: "STANDARD", blocked: false },
      { no: "1996-S", description: "ATLANTA Whiteboard, base", category: "OFFICE", uom: "PCS", unitPrice: 3250, unitCost: 1900, inventory: 7, reorderPoint: 3, vatGroup: "STANDARD", blocked: false },
    ];

    function line(itemNo, qty) {
      var it = items.filter(function (i) { return i.no === itemNo; })[0];
      return { itemNo: itemNo, qty: qty, unitPrice: it.unitPrice };
    }

    var orders = [
      { no: "SO-1001", customerNo: "C00010", orderDate: day(-12), externalNo: "PO-55120", status: "posted", shipmentMethod: "DELIVERY", lines: [line("1896-S", 8), line("1908-S", 8), line("1928-S", 8)] },
      { no: "SO-1002", customerNo: "C00040", orderDate: day(-9), externalNo: "BE-2026-311", status: "posted", shipmentMethod: "EXW", lines: [line("1920-S", 3), line("1900-S", 24)] },
      { no: "SO-1003", customerNo: "C00070", orderDate: day(-6), externalNo: "TOS-77841", status: "released", shipmentMethod: "DELIVERY", lines: [line("1968-S", 12), line("1906-S", 12)] },
      { no: "SO-1004", customerNo: "C00020", orderDate: day(-4), externalNo: "", status: "open", shipmentMethod: "PICKUP", lines: [line("1960-S", 16)] },
      { no: "SO-1005", customerNo: "C00050", orderDate: day(-3), externalNo: "SUS-4410", status: "open", shipmentMethod: "DELIVERY", lines: [line("1896-S", 4), line("1924-W", 4)] },
      { no: "SO-1006", customerNo: "C00090", orderDate: day(-2), externalNo: "EI-90211", status: "released", shipmentMethod: "DELIVERY", lines: [line("1996-S", 2), line("1964-S", 10)] },
      { no: "SO-1007", customerNo: "C00030", orderDate: day(-1), externalNo: "", status: "open", shipmentMethod: "DELIVERY", lines: [line("1988-S", 6), line("1928-S", 6)] },
    ];

    var invoices = [
      { no: "PI-1001", vendor: "Nordic Wood Supply A/S", vendorInvoiceNo: "NWS-88412", documentDate: day(-21), postingDate: day(-20), dueDate: day(10), currency: "DKK", status: "posted",
        lines: [{ description: "Oak veneer panels, 19 mm", qty: 120, unitCost: 245 }, { description: "Beech edge banding, 50 m roll", qty: 30, unitCost: 118 }],
        comments: [{ by: "Anna Jensen", action: "approved", at: day(-19), text: "Matches PO 7702." }] },
      { no: "PI-1002", vendor: "Hansen Metalværk ApS", vendorInvoiceNo: "HM-2026-0931", documentDate: day(-10), postingDate: day(-9), dueDate: day(21), currency: "DKK", status: "approved",
        lines: [{ description: "Chair base, 5-star aluminium", qty: 60, unitCost: 312 }, { description: "Gas lift cylinder, class 4", qty: 60, unitCost: 96 }],
        comments: [{ by: "Anna Jensen", action: "approved", at: day(-8), text: "Received in full." }] },
      { no: "PI-1003", vendor: "Sheffield Steel Components Ltd", vendorInvoiceNo: "SSC-44718", documentDate: day(-7), postingDate: day(-6), dueDate: day(24), currency: "GBP", status: "pending",
        lines: [{ description: "Steel drawer runners, 450 mm", qty: 200, unitCost: 6.85 }, { description: "Cam lock fittings (box of 100)", qty: 12, unitCost: 21.4 }], comments: [] },
      { no: "PI-1004", vendor: "Rheinland Möbelteile GmbH", vendorInvoiceNo: "RM-260917", documentDate: day(-5), postingDate: day(-4), dueDate: day(26), currency: "EUR", status: "pending",
        lines: [{ description: "Desk frame, powder-coated steel", qty: 40, unitCost: 186.5 }, { description: "Height adjustment motor kit", qty: 40, unitCost: 92 }, { description: "Mounting kit", qty: 40, unitCost: 12.4 }], comments: [] },
      { no: "PI-1005", vendor: "Bergen Tekstil AS", vendorInvoiceNo: "BT-10293", documentDate: day(-3), postingDate: day(-2), dueDate: day(28), currency: "EUR", status: "pending",
        lines: [{ description: "Upholstery fabric, wool blend, blue", qty: 180, unitCost: 14.2 }, { description: "Upholstery fabric, wool blend, black", qty: 220, unitCost: 14.2 }], comments: [] },
      { no: "PI-1006", vendor: "Lumen Belysning ApS", vendorInvoiceNo: "LB-5521", documentDate: day(-14), postingDate: day(-13), dueDate: day(1), currency: "DKK", status: "rejected",
        lines: [{ description: "LED module 12 W, warm white", qty: 150, unitCost: 64 }],
        comments: [{ by: "Anna Jensen", action: "rejected", at: day(-12), text: "Quantity differs from goods receipt (120 pcs)." }] },
    ];

    return { version: 1, seq: { customer: 120, order: 1008, item: 2000 }, customers: customers, items: items, orders: orders, invoices: invoices };
  }

  window.NW_SEED = seed;
  window.NW_DAY = day;
})();
