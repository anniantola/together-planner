import { describe, expect, it } from 'vitest'
import { friendlyAuthError } from '../src/lib/auth-errors'

describe('authentication error messages', () => {
  it('explains email quota exhaustion', () => {
    expect(friendlyAuthError({code:'over_email_send_rate_limit', status:429})).toContain('shared sending limit')
    expect(friendlyAuthError({message:'email rate limit exceeded'})).toContain('custom SMTP')
  })
  it('explains test email restrictions', () => {
    expect(friendlyAuthError({code:'email_address_not_authorized'})).toContain('custom SMTP')
  })
  it('recognizes unverified accounts', () => {
    expect(friendlyAuthError({code:'email_not_confirmed'})).toContain('verification link')
  })
  it('keeps generic errors understandable', () => {
    expect(friendlyAuthError({status:429})).toContain('Too many requests')
    expect(friendlyAuthError(null)).toContain('Something went wrong')
  })
})
