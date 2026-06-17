import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
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

const InviteTeamMemberInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(320),
  phoneWhatsapp: z.string().trim().min(8).max(24).nullable().optional(),
  funcao: z.string().trim().max(120).nullable().optional(),
  nivelAcesso: z.enum(['gestor', 'operacional']).default('operacional'),
  possuiAgenda: z.boolean().default(false),
  comissao: z.number().min(0).max(100).default(0),
}).strict()

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return response({ ok: true })
  if (request.method !== 'POST') return response({ ok: false, error: 'method_not_allowed' }, 405)

  try {
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

    const parsed = InviteTeamMemberInputSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) return response({ ok: false, error: 'invalid_input' }, 400)
    const body = parsed.data
    const email = body.email.toLowerCase()

    const { data: memberResult, error: memberError } = await userClient.rpc('create_team_member', {
      p_name: body.name,
      p_email: email,
      p_phone_whatsapp: body.phoneWhatsapp ?? null,
      p_funcao: body.funcao ?? null,
      p_nivel_acesso: body.nivelAcesso,
      p_possui_agenda: body.possuiAgenda,
      p_comissao: body.comissao,
    })
    if (memberError) return response({ ok: false, error: 'team_member_create_failed' }, 400)

    const service = createServiceClient()
    const redirectTo = Deno.env.get('PROFESSIONAL_APP_URL')
    const { data: usersPage, error: usersError } = await service.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (usersError) {
      await service.from('team_members').update({ is_active: false }).eq('id', memberResult.team_member_id)
      return response({ ok: false, error: 'identity_lookup_failed' }, 500)
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
          role: body.nivelAcesso,
        },
      })
      if (invitationError || !invitation.user) {
        await service.from('team_members').update({ is_active: false }).eq('id', memberResult.team_member_id)
        return response({ ok: false, error: 'invite_failed' }, 400)
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
      return response({ ok: false, error: 'identity_link_failed' }, 500)
    }

    return response({ ...memberResult, invited: true })
  } catch {
    return response({ ok: false, error: 'internal_error' }, 500)
  }
})
