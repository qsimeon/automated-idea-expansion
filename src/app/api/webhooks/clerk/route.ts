import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { WebhookEvent } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  // Get the webhook secret from environment variables
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error('Please add CLERK_WEBHOOK_SECRET from Clerk Dashboard to .env');
  }

  // Get the headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get('svix-id');
  const svix_timestamp = headerPayload.get('svix-timestamp');
  const svix_signature = headerPayload.get('svix-signature');

  // If there are no headers, error out
  if (!svix_id || !svix_timestamp || !svix_signature) {
    return new Response('Error occured -- no svix headers', {
      status: 400,
    });
  }

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Create a new Svix instance with your webhook secret
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;

  // Verify the webhook
  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error('Error verifying webhook:', err);
    return new Response('Error occured', {
      status: 400,
    });
  }

  // Handle the webhook
  const eventType = evt.type;

  if (eventType === 'user.created') {
    const { id, email_addresses, first_name, last_name } = evt.data;

    // Insert user into Supabase
    const { error } = await supabase.from('users').insert({
      clerk_user_id: id,
      email: email_addresses[0]?.email_address,
      name: `${first_name || ''} ${last_name || ''}`.trim() || null,
    });

    if (error) {
      console.error('Error creating user in Supabase:', error);
      return new Response('Error creating user', { status: 500 });
    }

    console.log(`User ${id} created in Supabase`);
  }

  if (eventType === 'user.updated') {
    const { id, email_addresses, first_name, last_name } = evt.data;

    // Update user in Supabase
    const { error } = await supabase
      .from('users')
      .update({
        email: email_addresses[0]?.email_address,
        name: `${first_name || ''} ${last_name || ''}`.trim() || null,
      })
      .eq('clerk_user_id', id);

    if (error) {
      console.error('Error updating user in Supabase:', error);
      return new Response('Error updating user', { status: 500 });
    }

    console.log(`User ${id} updated in Supabase`);
  }

  if (eventType === 'user.deleted') {
    const { id } = evt.data;

    // Delete user from Supabase (cascade will handle related records)
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('clerk_user_id', id);

    if (error) {
      console.error('Error deleting user in Supabase:', error);
      return new Response('Error deleting user', { status: 500 });
    }

    console.log(`User ${id} deleted from Supabase`);
  }

  return new Response('', { status: 200 });
}
