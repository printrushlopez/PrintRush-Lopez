import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function generatePassword() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let pwd = "";
  for (let i = 0; i < 12; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pwd;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { applicationId } = await req.json();

    if (!applicationId) {
      throw new Error('applicationId is required');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // 1. Fetch application
    const { data: app, error: fetchErr } = await supabaseAdmin
      .from('shop_applications')
      .select('*')
      .eq('id', applicationId)
      .single();

    if (fetchErr || !app) throw new Error('Application not found');
    if (app.status === 'approved') throw new Error('Application is already approved');

    // 2. Create User
    const tempPassword = generatePassword();
    const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.createUser({
      email: app.owner_email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { role: 'owner' }
    });

    // If user already exists, we might need to handle it or just use their existing account
    let userId = userData?.user?.id;
    if (userErr) {
      if (userErr.message.includes('already exists')) {
        // Fetch the user id if they already exist
        const { data: existingUser } = await supabaseAdmin.auth.admin.listUsers();
        const found = existingUser.users.find(u => u.email === app.owner_email);
        if (found) {
          userId = found.id;
        } else {
          throw new Error('User exists but cannot retrieve ID');
        }
      } else {
        throw userErr;
      }
    }

    // 3. Create Shop
    const { data: shopData, error: shopErr } = await supabaseAdmin
      .from('shops')
      .insert([{
        name: app.shop_name,
        slug: app.slug,
        address: app.address,
        owner_email: app.owner_email,
        owner_phone: app.owner_phone,
        lat: app.lat,
        lng: app.lng,
        plan: app.plan,
        is_active: true
      }])
      .select()
      .single();

    if (shopErr) throw shopErr;
    const shopId = shopData.id;

    // 4. Create Shop Owner linking
    if (userId) {
      const { error: ownerErr } = await supabaseAdmin
        .from('shop_owners')
        .insert([{
          shop_id: shopId,
          user_id: userId,
          role: 'owner'
        }]);
      if (ownerErr && !ownerErr.message.includes('duplicate')) throw ownerErr;
    }

    // 5. Update application
    await supabaseAdmin
      .from('shop_applications')
      .update({ status: 'approved' })
      .eq('id', applicationId);

    // 6. Send Email
    const downloadUrl = 'https://github.com/printrushlopez/PrintRush-Lopez/releases/latest/download/PrintRUSH.Desktop.Agent.Setup.1.0.0.exe';
    
    let passwordMessage = userErr && userErr.message.includes('already exists') 
      ? `<p>You already have an account with this email. Please use your existing password to log into the web portal.</p>`
      : `
        <div class="cred-label">Your Web Portal Password</div>
        <div class="cred-value">${tempPassword}</div>
      `;

    const emailBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Inter, Arial, sans-serif; background: #f4f4f8; margin: 0; padding: 0; }
    .wrap { max-width: 580px; margin: 32px auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: linear-gradient(135deg, #00C2E0, #E8007D); padding: 32px 40px; text-align: center; }
    .header h1 { color: #fff; font-size: 24px; font-weight: 900; margin: 0; letter-spacing: -0.02em; }
    .header p { color: rgba(255,255,255,0.85); font-size: 14px; margin: 6px 0 0; }
    .body { padding: 36px 40px; }
    .body p { color: #444; font-size: 15px; line-height: 1.7; margin-bottom: 16px; }
    .cred-box { background: #f8f8fc; border: 1.5px solid #e0e0f0; border-radius: 12px; padding: 20px 24px; margin: 24px 0; }
    .cred-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin-bottom: 4px; }
    .cred-value { font-size: 14px; font-family: monospace; color: #111; word-break: break-all; background: #eeeef8; padding: 8px 12px; border-radius: 6px; margin-bottom: 16px; }
    .cred-value:last-child { margin-bottom: 0; }
    .btn { display: block; width: fit-content; margin: 28px auto; background: linear-gradient(135deg, #00C2E0, #E8007D); color: #fff; font-weight: 700; font-size: 16px; text-decoration: none; padding: 16px 36px; border-radius: 10px; text-align: center; }
    .footer { padding: 20px 40px; border-top: 1px solid #eee; text-align: center; color: #aaa; font-size: 12px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="header">
      <h1>🖨️ PrintRUSH Lopez</h1>
      <p>Your shop has been approved!</p>
    </div>
    <div class="body">
      <p>Hi <strong>${app.shop_name}</strong> team,</p>
      <p>Great news — your shop application has been confirmed and is now ready to go live on the PrintRUSH Lopez platform!</p>
      <p>Follow these 3 easy steps to get started:</p>
      <ol style="color:#444;font-size:15px;line-height:2;padding-left:20px;">
        <li>Click the <strong>Download PrintRUSH Agent</strong> button below</li>
        <li>Install it like any Windows program (Next → Next → Finish)</li>
        <li>When the app opens, paste in your <strong>Shop ID</strong> below</li>
      </ol>

      <div class="cred-box">
        <div class="cred-label">Your Shop ID (For Desktop App)</div>
        <div class="cred-value">${shopId}</div>
        ${passwordMessage}
      </div>

      <p style="font-size:13px;color:#888;">Keep these credentials safe. The desktop app only needs your Shop ID.</p>

      <a href="${downloadUrl}" class="btn">⬇️ Download PrintRUSH Agent (.exe)</a>
    </div>
    <div class="footer">
      PrintRUSH Lopez — Municipality of Lopez, Quezon
    </div>
  </div>
</body>
</html>
    `.trim();

    try {
      await fetch(`${supabaseUrl}/functions/v1/_internal/smtp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          to: app.owner_email,
          subject: `✅ Your PrintRUSH Shop Is Approved — Setup Instructions Inside`,
          html: emailBody,
        }),
      });
    } catch (smtpErr) {
      console.error('SMTP failed, but approval succeeded:', smtpErr);
    }

    return new Response(JSON.stringify({ success: true, shopId, message: 'Shop approved and email sent' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err: any) {
    console.error('approve-shop failed:', err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
