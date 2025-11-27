"use server";

import { auth } from "@/lib/auth";
import { sql } from "@/db";
import type { CreateContact, UpdateContact } from "@/schema";
import { headers } from "next/headers";
import { sendPushNotificationToUser } from "./push";

async function getUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    throw new Error("Not authenticated");
  }

  return session.user;
}

export async function createContactAction(data: CreateContact) {
  try {
    const user = await getUser();

    const now = new Date().toISOString();

    // Use transaction to insert and get txid atomically
    const [insertResult, txidResult] = await sql.transaction([
      sql`INSERT INTO contacts (id, name, email, tel, title, company, user_id, created_at, updated_at)
          VALUES (${data.id}, ${data.name}, ${data.email ?? null}, ${data.tel ?? null}, ${data.title ?? null}, ${data.company ?? null}, ${user.id}, ${now}, ${now})
          RETURNING *`,
      sql`SELECT pg_current_xact_id()::text as txid`,
    ]);

    const insertedContact = insertResult[0];
    const txid = txidResult[0].txid;

    // Send push notification to the user's other devices
    // This runs asynchronously and doesn't block the response
    sendPushNotificationToUser(user.id, {
      title: "New Contact Added",
      body: `${insertedContact.name} was added to your contacts`,
      icon: "/icons/icon-192x192.png",
      url: "/",
      tag: `contact-${insertedContact.id}`,
    }).catch((err) => {
      console.error("Failed to send push notification:", err);
    });

    return {
      success: true,
      contact: insertedContact,
      txid,
    };
  } catch (error) {
    console.error("Error creating contact:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to create contact",
    };
  }
}

export async function updateContactAction(id: string, data: UpdateContact) {
  try {
    const user = await getUser();

    const now = new Date().toISOString();

    // Use transaction to update and get txid atomically
    const [updateResult, txidResult] = await sql.transaction([
      sql`UPDATE contacts
          SET name = ${data.name},
              email = ${data.email ?? null},
              tel = ${data.tel ?? null},
              title = ${data.title ?? null},
              company = ${data.company ?? null},
              updated_at = ${now}
          WHERE id = ${id} AND user_id = ${user.id}
          RETURNING *`,
      sql`SELECT pg_current_xact_id()::text as txid`,
    ]);

    const updatedContact = updateResult[0];
    const txid = txidResult[0].txid;

    if (!updatedContact) {
      return {
        success: false,
        error: "Contact not found",
      };
    }

    return {
      success: true,
      contact: updatedContact,
      txid,
    };
  } catch (error) {
    console.error("Error updating contact:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to update contact",
    };
  }
}

export async function deleteContactAction(id: string) {
  try {
    const user = await getUser();

    // Use transaction to delete and get txid atomically
    const [deleteResult, txidResult] = await sql.transaction([
      sql`DELETE FROM contacts
          WHERE id = ${id} AND user_id = ${user.id}
          RETURNING id`,
      sql`SELECT pg_current_xact_id()::text as txid`,
    ]);

    const deletedContact = deleteResult[0];
    const txid = txidResult[0].txid;

    if (!deletedContact) {
      return {
        success: false,
        error: "Contact not found",
      };
    }

    return {
      success: true,
      contactId: id,
      txid,
    };
  } catch (error) {
    console.error("Error deleting contact:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to delete contact",
    };
  }
}
