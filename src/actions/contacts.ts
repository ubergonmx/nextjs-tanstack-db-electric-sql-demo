"use server";

import { auth } from "@/lib/auth";
import { db } from "@/db";
import { contactsTable } from "@/schema";
import { and, eq } from "drizzle-orm";
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

    const now = new Date();
    const newContact = {
      ...data,
      userId: user.id,
      createdAt: now,
      updatedAt: now,
    };

    const [insertedContact] = await db
      .insert(contactsTable)
      .values(newContact)
      .returning();

    // Send push notification to the user's other devices
    // This runs asynchronously and doesn't block the response
    sendPushNotificationToUser(user.id, {
      title: "New Contact Added",
      body: `${insertedContact.name} was added to your contacts`,
      icon: "/icons/icon-192x192.svg",
      url: "/",
      tag: `contact-${insertedContact.id}`,
    }).catch((err) => {
      console.error("Failed to send push notification:", err);
    });

    return {
      success: true,
      contact: insertedContact,
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

    const updateData = {
      ...data,
      userId: user.id,
      updatedAt: new Date(),
    };

    const [updatedContact] = await db
      .update(contactsTable)
      .set(updateData)
      .where(and(eq(contactsTable.id, id), eq(contactsTable.userId, user.id)))
      .returning();

    if (!updatedContact) {
      return {
        success: false,
        error: "Contact not found",
      };
    }

    // Verify the contact belongs to the user
    if (updatedContact.userId !== user.id) {
      return {
        success: false,
        error: "Not authorized to update this contact",
      };
    }

    return {
      success: true,
      contact: updatedContact,
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

    // First check if the contact exists and belongs to the user
    const [existingContact] = await db
      .select()
      .from(contactsTable)
      .where(and(eq(contactsTable.id, id), eq(contactsTable.userId, user.id)))
      .limit(1);

    if (!existingContact) {
      return {
        success: false,
        error: "Contact not found",
      };
    }

    if (existingContact.userId !== user.id) {
      return {
        success: false,
        error: "Not authorized to delete this contact",
      };
    }

    await db.delete(contactsTable).where(eq(contactsTable.id, id));

    return {
      success: true,
      contactId: id,
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
