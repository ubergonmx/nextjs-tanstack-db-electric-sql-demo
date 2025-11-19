import { createCollection } from "@tanstack/react-db";
import { electricCollectionOptions } from "@tanstack/electric-db-collection";
import { selectContactSchema } from "@/schema";
import {
  createContactAction,
  updateContactAction,
  deleteContactAction,
} from "@/actions/contacts";

export { type Contact } from "@/schema";

const contactSchema = selectContactSchema.omit({
  userId: true,
  createdAt: true,
  updatedAt: true,
});

export const contactCollection = createCollection(
  // @ts-expect-error - Type mismatch between @tanstack/react-db and @tanstack/electric-db-collection
  // The electricCollectionOptions return type expects comparisonOpts/compareOptions that aren't in the inferred type.
  // This is likely a type definition issue in the library versions (both 0.1.1).
  electricCollectionOptions({
    id: "contacts",
    shapeOptions: {
      url: new URL(
        `/api/contacts`,
        typeof window !== `undefined`
          ? window.location.origin
          : `http://localhost:3000`,
      ).toString(),
      params: {
        table: "contacts",
      },
    },
    schema: contactSchema,
    getKey: (item) => item.id,

    // Add server action handlers for mutations
    onInsert: async ({ transaction }) => {
      const results = [];

      for (const mutation of transaction.mutations) {
        const contactData = mutation.modified;

        const result = await createContactAction(contactData);

        if (!result.success) {
          throw new Error(result.error || "Failed to create contact");
        }

        results.push(Date.now()); // Use timestamp as txid
      }

      return { txid: results };
    },

    onUpdate: async ({ transaction }) => {
      const results = [];
      for (const mutation of transaction.mutations) {
        const contactId = String(mutation.key);
        const changes = mutation.changes;

        const { id, ...updateData } = changes;

        const result = await updateContactAction(contactId, updateData);

        if (!result.success) {
          throw new Error(result.error || "Failed to update contact");
        }

        results.push(Date.now()); // Use timestamp as txid
      }

      return { txid: results };
    },

    onDelete: async ({ transaction }) => {
      const results = [];

      for (const mutation of transaction.mutations) {
        const contactId = String(mutation.key);

        const result = await deleteContactAction(contactId);

        if (!result.success) {
          throw new Error(result.error || "Failed to delete contact");
        }

        results.push(Date.now()); // Use timestamp as txid
      }

      return { txid: results };
    },
  }),
);
