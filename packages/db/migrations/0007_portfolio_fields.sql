-- TUR:20 — Portföy filtreleri için site ve apartman adı.
-- Site adı: "Güneş Sitesi" gibi site içindeki daireler.
-- Apartman adı: site dışı apartman / iş hanı adı.
-- İkisi de serbest metin: emlakçı her sitede aynı yazımı kullanmıyor.
alter table property add column if not exists site_name text;
alter table property add column if not exists building_name text;

create index if not exists property_tenant_site_idx on property (tenant_id, site_name);
create index if not exists property_tenant_building_idx on property (tenant_id, building_name);
