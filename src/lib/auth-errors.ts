/** Human-readable messages for expected Supabase Auth errors. */
export function friendlyAuthError(error: unknown): string {
  const e = error as { code?: string; message?: string; status?: number } | null
  const code = e?.code ?? ''
  const message = e?.message ?? ''
  if (code === 'over_email_send_rate_limit' || /email rate limit exceeded/i.test(message))
    return 'Too many confirmation or reset emails have been requested for this app. Its email service has reached its shared sending limit. Please try later; repeated attempts will not help. The app owner needs a custom SMTP provider for regular use.'
  if (code === 'email_address_not_authorized' || /email address not authorized/i.test(message))
    return 'This app is still using the Supabase test email service, which cannot email this address. The app owner must configure custom SMTP before inviting other people.'
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(message))
    return 'Your email is not verified yet. Check your inbox for the verification link before signing in.'
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message))
    return 'The email or password is incorrect, or this account has not been created. Check your details or reset your password.'
  if (code === 'weak_password')
    return 'This password does not meet the security requirements. Please use a stronger password.'
  if (code === 'user_already_exists' || /user already registered/i.test(message))
    return 'An account may already exist for this email. Try signing in or resetting your password.'
  if (e?.status === 429)
    return 'Too many requests. Please wait before trying again.'
  return message || 'Something went wrong. Please try again.'
}
