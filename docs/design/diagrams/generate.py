"""Generate self-contained SVG sources for the README diagrams (no remote renderer)."""
from pathlib import Path
from html import escape

OUT = Path(__file__).resolve().parent
OUT.mkdir(parents=True, exist_ok=True)

def start(height, title, subtitle):
    return [f'<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="{height}" viewBox="0 0 1280 {height}" role="img" aria-label="{escape(title)}">',
      '<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M1 1L8 5L1 9" fill="none" stroke="#6b83ab" stroke-width="1.6"/></marker></defs>',
      f'<rect width="1280" height="{height}" rx="20" fill="#f7f9ff"/>',
      '<style>text{font-family:Arial,Helvetica,sans-serif;fill:#122344}.title{font-size:29px;font-weight:700}.sub{font-size:16px;fill:#61718b}.name{font-size:20px;font-weight:700}.detail{font-size:15px;fill:#526785}.label{font-size:14px;fill:#526785}</style>',
      f'<text x="40" y="50" class="title">{escape(title)}</text><text x="40" y="80" class="sub">{escape(subtitle)}</text>']

def box(parts, x, y, w, h, title, detail='', color='#ffffff', stroke='#d7e2f5'):
    parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="13" fill="{color}" stroke="{stroke}" stroke-width="1.6"/>')
    parts.append(f'<text x="{x+w/2}" y="{y+(h/2-4 if detail else h/2+7)}" text-anchor="middle" class="name">{escape(title)}</text>')
    if detail:
        parts.append(f'<text x="{x+w/2}" y="{y+h/2+23}" text-anchor="middle" class="detail">{escape(detail)}</text>')

def line(parts, path, dashed=False):
    parts.append(f'<path d="{path}" fill="none" stroke="#6b83ab" stroke-width="2" marker-end="url(#arrow)"'+(' stroke-dasharray="7 6"' if dashed else '')+'/>')

def label(parts, x, y, text):
    parts.append(f'<text x="{x}" y="{y}" class="label">{escape(text)}</text>')

p=start(1120, 'From service request to recorded outcome', 'A human-approved workflow connecting preparation, field work and follow-ups.')
box(p,110,115,600,80,'1. Capture or import the request','Customer, site, equipment and service need')
box(p,110,235,600,80,'2. Review context and readiness','Check prerequisites, required parts and missing details')
line(p,'M410 195V235')
p.append('<path d="M410 355L710 410L410 465L110 410Z" fill="#edf3ff" stroke="#245cf6" stroke-width="1.7"/>')
p.append('<text x="410" y="417" text-anchor="middle" class="name">Ready to proceed?</text>')
line(p,'M410 315V355')
box(p,900,370,300,80,'Resolve the gaps','Update evidence and review again')
line(p,'M710 410H900'); label(p,750,395,'Not yet')
line(p,'M1050 370V275H710')
box(p,110,515,600,80,'3. Compare and approve a technician','Revalidate eligibility; reserve required stock in LEDGER mode', '#edf3ff','#b4cbff')
line(p,'M410 465V515');label(p,430,493,'Yes')
box(p,110,635,600,80,'4. Acknowledge and start the visit','The assigned technician receives the preparation context')
line(p,'M410 595V635')
box(p,110,755,600,80,'5. Record findings and close','Record actual stock use; release unused allocations')
line(p,'M410 715V755')
box(p,900,755,300,80,'Linked follow-up draft','When another visit is needed')
line(p,'M710 795H900')
line(p,'M1200 795H1240V145H710')
label(p,950,130,'Fresh preparation and assignment')
box(p,110,885,600,80,'6. Review outcomes and reporting','Trace recorded reasons, exclusions and company changes')
line(p,'M410 835V885')
label(p,110,1020,'Required stock is protected only for ledger-backed assignments.')
label(p,110,1050,'Follow-ups copy context and requirements, not assignments or stock allocations.')
p.append('</svg>');(OUT/'service-workflow.svg').write_text('\n'.join(p),encoding='utf-8')

p=start(1080,'ServiceGrid IQ system architecture','Current local environment: modular API, separate document worker and private data services.')
box(p,410,115,460,80,'Desktop and mobile web','Owners, dispatchers and assigned technicians','#edf3ff','#b4cbff')
box(p,410,265,460,80,'Nginx + React application','TypeScript / Vite; same-origin API requests')
box(p,40,265,280,105,'Keycloak / OIDC','Local identity provider')
box(p,410,425,460,105,'Express API + Zod','Authorization, business rules and transactions','#edf3ff','#b4cbff')
box(p,40,670,340,115,'PostgreSQL + pgvector','Operational data, audit and full-text search')
box(p,470,670,340,115,'Redis + BullMQ','Authenticated ingestion queue')
box(p,940,670,300,115,'Private object storage','S3-compatible / SeaweedFS')
box(p,470,870,340,100,'Document worker','Extraction, indexing and recovery sweeps','#edf3ff','#b4cbff')
box(p,940,870,300,100,'Optional OpenAI','Embeddings and evidence selection','#f0edff','#d3c8f4')
line(p,'M640 195V265')
line(p,'M410 155H180V265');label(p,215,139,'Browser sign-in redirects')
line(p,'M640 345V425');label(p,660,390,'API requests')
line(p,'M410 475H350V320H320');label(p,40,422,'API uses the OIDC backchannel')
line(p,'M640 530V590H210V670');label(p,50,646,'Scoped reads / writes')
line(p,'M640 530V670');label(p,660,626,'Queue work')
line(p,'M640 530V590H1090V670');label(p,945,646,'Private file access')
line(p,'M640 785V870');label(p,660,833,'Ingest documents')
line(p,'M470 920H420V728H380');label(p,42,829,'Publish chunks and ingestion state')
line(p,'M810 920H880V728H940');label(p,897,827,'Read files')
line(p,'M810 920H940',True)
line(p,'M870 475H1260V920H1240',True)
label(p,40,1015,'Dashed connections: optional provider processing with consent, configuration and usage limits.')
label(p,40,1045,'Prisma runs migrations as a separate job. AWS staging is prepared separately and remains undeployed.')
p.append('</svg>');(OUT/'system-architecture.svg').write_text('\n'.join(p),encoding='utf-8')
print('Generated README diagram SVG sources.')
