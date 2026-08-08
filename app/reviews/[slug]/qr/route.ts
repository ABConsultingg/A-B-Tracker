// app/reviews/[slug]/qr/route.ts
// Downloadable PNG QR code pointing at the client's Google review form, drawn in
// their brand colour. Public on purpose — clients print it for the office,
// trucks, business cards and door hangers.
import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { getReviewPageData, reviewLinkFor } from '@/lib/reviews/google'

// Reads the client's live config, so it must not be cached at the route level
// either — a Place ID change has to take effect on the next download.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const data = await getReviewPageData(params.slug)
  if (!data) return new NextResponse('Not found', { status: 404 })
  if (!data.placeId) {
    return NextResponse.json(
      { error: 'No google_place_id configured for this client' },
      { status: 409 }
    )
  }

  // ?size= lets a print job ask for something bigger than the screen default.
  const requested = Number(req.nextUrl.searchParams.get('size') || 1024)
  const width = Math.min(Math.max(Number.isFinite(requested) ? requested : 1024, 256), 2048)

  // Brand colour as the foreground instead of black. Fall back to near-black if
  // the stored value is not a usable hex, since QR needs strong contrast.
  const hex = /^#[0-9a-fA-F]{6}$/.test(data.brandColor) ? data.brandColor : '#111111'

  try {
    const png = await QRCode.toBuffer(reviewLinkFor(data.placeId), {
      type: 'png',
      width,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: hex, light: '#FFFFFF' },
    })

    return new NextResponse(new Uint8Array(png), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="${params.slug}-google-review-qr.png"`,
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch (e) {
    console.error('[reviews/qr] generation failed', e)
    return new NextResponse('QR generation failed', { status: 500 })
  }
}
