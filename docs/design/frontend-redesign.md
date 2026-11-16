# ServiceGrid IQ frontend design

The frontend uses a blue, white and navy design system with a separate public website and role-aware operational workspace. Public marketing copy describes implemented workflows without invented customer testimonials, usage statistics or performance claims. The landing page product cards are labelled previews.

## Navigation and interaction

- Owners have Overview, Dispatch, Workforce, Parts & locations, Inventory, Manuals & evidence, Reports & data and Team & access.
- Dispatchers have Overview, Dispatch, Workforce and Parts & locations. Technicians have their own service visits.
- Operational sections stay mounted while switching navigation, preserving search, selected records and unsaved form input. Company switching and sign-out retain the existing discard protection. Hidden sections are removed from keyboard and accessibility navigation by the HTML `hidden` attribute.
- Overview numbers are retrieved from the authorized company job APIs. Empty/loading/error states are explicit; no trend percentages or synthetic performance figures are displayed.
- Mobile navigation uses a collapsible sidebar. Forms, job cards, evidence panels and tables share responsive styling. Large tables scroll within their own container.
- Focus states, skip links, semantic headings, visible field labels, status text as well as color, and reduced-motion support are included.

## Images and provenance

The original technician image was created with the built-in image-generation tool. It depicts fictional people, not customers or endorsements. The project includes the source PNG and optimized WebP derivatives:

- `apps/web/public/images/technicians-original.png`
- `apps/web/public/images/technicians-hero.webp`
- `apps/web/public/images/technicians-team.webp`

Final prompt, built-in image-generation mode:

> Use case: photorealistic-natural. Create a premium editorial website photograph, wide landscape 3:2 composition, for ServiceGrid IQ commercial HVAC field service software. Two professional adult HVAC service technicians, diverse South Asian man in his early 30s and woman in her early 30s, in clean navy blue work shirts and practical work trousers, standing safely on ground level beside a commercial outdoor air conditioning installation at a modern office building. Main man on right side, woman near center, naturally reviewing a tablet held by the woman, subtle tool belt, professionally credible PPE appropriate to non-invasive external visual inspection. Warm natural daylight, authentic candid interaction, contemporary architecture and blue sky, sharp human details, tasteful muted blue and slate palette. Subjects mostly in right two thirds, some breathing room on left. No text, logos, watermarks, badges or graphic UI. Realistic hands, no work on live circuits. High-end business photography, not a stock photo handshake or overly staged pose.

The WebP images are derived from the same original scene. The second crop is not represented as a separate customer team. The public website was informed by [Jobber's public page](https://www.getjobber.com/) as an industry reference; no Jobber artwork, copy, testimonials or metrics are reused. This is a visual redesign of the existing local application, not an AWS deployment or a change to the product's supported operational scope.

## Verification record

- On 2026-11-17 (Asia/Calcutta), the production frontend and Linux web-container builds, workspace typecheck, lint and documentation checks passed.
- All 19 real-container browser workflow tests passed, including company isolation, invitations, dispatch approval, scheduling, mobile visit outcomes, manual ingestion/revocation, CSV/reporting and stock lifecycle/retry checks. Existing tests now navigate through the appropriate workspace section.
- Two design-specific browser checks cover the landing links/local images, mobile menu, every owner workspace, API-derived overview counts, AI usage display, keyboard dismissal/focus restoration, retained unsaved input and mobile width. They are repeated after the final typography/contrast refinements.
- Desktop and 390px mobile screenshots were inspected. The README includes the public landing-page preview. This is not a claim of WCAG certification or customer usability validation.
- GitHub CI verification is recorded after the implementation is pushed.
