import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createServiceClient } from '../_shared/supabase.ts'
import { jsonResponse } from '../_shared/http.ts'

const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
}

function response(body: unknown, status = 200) {
  return jsonResponse(body, { status, headers: CORS_HEADERS })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return response({ ok: true })
  if (request.method !== 'POST') return response({ ok: false, error: 'method_not_allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const authorization = request.headers.get('authorization')
  if (!url || !anonKey || !authorization) return response({ ok: false, error: 'unauthorized' }, 401)

  const userClient = createClient(url, anonKey, {
    global: { headers: { authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: context, error: contextError } = await userClient.rpc('get_professional_auth_context')
  if (contextError || !context || context.role !== 'gestor') {
    return response({ ok: false, error: 'gestor_role_required' }, 403)
  }

  const body = await request.json()
  const email = String(body.email ?? '').trim().toLowerCase()
  if (!email) return response({ ok: false, error: 'email_required' }, 400)

  const { data: memberResult, error: memberError } = await userClient.rpc('create_team_member', {
    p_name: body.name,
    p_email: email,
    p_phone_whatsapp: body.phoneWhatsapp ?? null,
    p_funcao: body.funcao ?? null,
    p_nivel_acesso: body.nivelAcesso ?? 'operacional',
    p_possui_agenda: body.possuiAgenda ?? false,
    p_comissao: body.comissao ?? 0,
  })
  if (memberError) return response({ ok: false, error: memberError.message }, 400)

  const service = createServiceClient()
  const redirectTo = Deno.env.get('PROFESSIONAL_APP_URL')
  const { data: usersPage, error: usersError } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (usersError) {
    await service.from('team_members').update({ is_active: false }).eq('id', memberResult.team_member_id)
    return response({ ok: false, error: usersError.message }, 500)
  }
  const existingUser = usersPage.users.find((user) => user.email?.toLowerCase() === email)

  if (existingUser) {
    const [{ data: owner }, { data: member }] = await Promise.all([
      service.from('professionals').select('id').eq('user_id', existingUser.id).maybeSingle(),
      service.from('team_members').select('id').eq('user_id', existingUser.id).maybeSingle(),
    ])
    if (owner || member) {
      await service.from('team_members').update({ is_active: false }).eq('id', memberResult.team_member_id)
      return response({ ok: false, error: 'identity_already_assigned' }, 409)
    }
  }

  let invitedUser = existingUser
  if (!invitedUser) {
    const { data: invitation, error: invitationError } = await service.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: {
        professional_id: context.professionalId,
        team_member_id: memberResult.team_member_id,
        role: body.nivelAcesso ?? 'operacional',
      },
    })
    if (invitationError || !invitation.user) {
      await service.from('team_members').update({ is_active: false }).eq('id', memberResult.team_member_id)
      return response({ ok: false, error: invitationError?.message ?? 'invite_failed' }, 400)
    }
    invitedUser = invitation.user
  }

  if (!invitedUser) {
    await service.from('team_members').update({ is_active: false }).eq('id', memberResult.team_member_id)
    return response({ ok: false, error: 'invite_failed' }, 400)
  }

  const { error: linkError } = await service
    .from('team_members')
    .update({ user_id: invitedUser.id })
    .eq('id', memberResult.team_member_id)
    .eq('professional_id', context.professionalId)
  if (linkError) {
    await service.from('team_members').update({ is_active: false }).eq('id', memberResult.team_member_id)
    return response({ ok: false, error: linkError.message }, 500)
  }

  return response({ ...memberResult, invited: true })
})
