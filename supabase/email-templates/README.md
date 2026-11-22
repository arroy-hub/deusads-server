# Email templates

The emails Supabase Auth sends for the dashboard. They are kept here and pasted by hand into the Supabase
project: **Authentication > Emails > Templates**. Changing a file here changes nothing until it is pasted.

| Template in Supabase | File | Subject |
| --- | --- | --- |
| Reset Password | `recovery.html` | Reset your DeusADS password |
| Change Email Address | `email-change.html` | Confirm your new DeusADS email |

The button in each email points straight at the dashboard (`{{ .SiteURL }}/auth/callback?token_hash=…&type=…`),
not at Supabase, so an email from deusads.com links to deusads.com only. The dashboard checks the token itself
(`app/auth/callback/route.js`, `lib/email-link.js`). **Site URL** in Authentication > URL Configuration must be
`https://app.deusads.com`, and the server code that understands these links has to be live before the
templates are pasted: an older server answers such a link with "link expired".

The emails use no pictures and no web fonts on purpose: a picture from another host is one more thing a spam
filter counts against the sender.
