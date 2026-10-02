// Supermarket tickets as tools: pasted text, a file read by Kafka, receipts Kafka took from the mail, the review queue and the list of tickets.
import { readKitchen } from '../store.mjs';
import { z, fail, tool } from './common.mjs';
import { importTicketText, importTicketFile, importTicketMail, ticketView, reviewQueue, mapTicketLine } from '../tickets.mjs';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa AAAA-MM-DD.');

export const TICKET_TOOLS = [
  tool({ name: 'ticket_import_text', schema: z.object({ text: z.string().trim().min(12).max(100000), store: z.string().trim().max(60).optional(), date: day.optional(), use_model: z.boolean().default(true) }),
    description: 'Import a supermarket ticket from text: food to the pantry, prices to the price book. Ticket de compra.\nLines it cannot recognise wait in the review queue (ticket_review_list); non-food lines are ignored. The local model may suggest a name for those but a person confirms it. The same ticket twice is imported once.\nSinónimos: pegar ticket, subir ticket, he comprado, importar compra, ticket del súper, ticket de Mercadona',
    run: ({ text, store, date, use_model }) => importTicketText(text, { store, date, useModel: use_model }) }),

  tool({ name: 'ticket_import_file', openWorld: true, schema: z.object({ path: z.string().trim().min(3).max(1000), store: z.string().trim().max(60).optional(), date: day.optional() }),
    description: 'Import a ticket from a PDF or photo on this computer, read by Kafka (OCR). Ticket desde foto o PDF.\nThe file is filed in Kafka (absolute path), its text is read back and imported like ticket_import_text. Says so when Kafka is not reachable.\nSinónimos: ticket en foto, ticket en PDF, escanear ticket, subir foto del ticket',
    run: ({ path, store, date }) => importTicketFile(path, { store, date }) }),

  tool({ name: 'ticket_import_mail', openWorld: true, schema: z.object({ limit: z.number().int().min(1).max(30).default(10), text: z.string().max(80).default('') }),
    description: 'Import supermarket receipts that the paperwork app read from the mail account. Tickets del correo.\nOnly receipts from the supermarkets in Ajustes that were not imported yet. Says so when Kafka is not reachable.\nSinónimos: tickets del correo, pedidos online, recibos del súper, importar compras del email',
    run: ({ limit, text }) => importTicketMail({ limit, text }) }),

  tool({ name: 'tickets_list', readOnly: true, schema: z.object({ ticket_id: z.string().optional(), limit: z.number().int().min(1).max(100).default(20) }),
    description: 'List imported tickets, or one ticket with every line and how it was matched. Tickets importados.\nSinónimos: mis tickets, últimas compras, qué compré, detalle del ticket',
    run: ({ ticket_id, limit }) => {
      const state = readKitchen();
      if (ticket_id) return { ticket: ticketView(state.tickets.find((t) => t.id === ticket_id) || fail('Ticket no encontrado.'), state) };
      return { count: state.tickets.length, tickets: state.tickets.slice(0, limit).map((t) => ticketView(t, state, { lines: false })) };
    } }),

  tool({ name: 'ticket_review_list', readOnly: true, schema: z.object({}),
    description: 'Ticket lines not matched to an ingredient, with the model’s suggestion. Líneas por revisar.\nSinónimos: tickets por revisar, líneas sin reconocer, qué no ha entendido, abreviaturas',
    run: () => { const queue = reviewQueue(readKitchen()); return { count: queue.length, lines: queue }; } }),

  tool({ name: 'ticket_line_map', schema: z.object({ ticket_id: z.string().min(1), line_id: z.string().min(1), ingredient: z.string().trim().max(100).optional(), ignore: z.boolean().optional(),
    ignore_always: z.boolean().optional(), learn: z.boolean().default(true) }),
    description: 'Resolve a ticket line: give its ingredient (and learn the abbreviation) or ignore it. Línea de ticket.\nignore_always keeps that text out of every future ticket. The result returns the updated ticket and how many lines are still to review.\nSinónimos: esto es, esa línea es, ignorar línea, no es comida, enseñar abreviatura del ticket',
    run: (args) => mapTicketLine(args) }),
];
