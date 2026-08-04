import { useClerk, useUser } from '@clerk/clerk-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function Profile() {
  const { user } = useUser()
  const { openUserProfile } = useClerk()
  return (
    <div>
      <h1 className="font-display text-[32px] font-semibold tracking-tight">Profile</h1>
      <p className="mb-8 text-sm text-muted-foreground">Account, security and organization settings</p>
      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="font-display text-lg">{user?.fullName ?? user?.primaryEmailAddress?.emailAddress}</CardTitle>
          <CardDescription>
            Manage your email, password, active sessions and organization through your account panel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => openUserProfile()}>Open account settings</Button>
        </CardContent>
      </Card>
    </div>
  )
}
