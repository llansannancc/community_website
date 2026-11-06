-- Test data for local development only (npm run db:local). Never run this on the live site.
INSERT INTO moderators (email, name, role) VALUES
  ('lead1@example.com', 'Lead One', 'lead'),
  ('lead2@example.com', 'Lead Two', 'lead'),
  ('mod1@example.com',  'Moderator One', 'moderator'),
  ('mod2@example.com',  'Moderator Two', 'moderator');

INSERT INTO events (title_en, title_cy, description_en, description_cy, location_en, location_cy, start_at, end_at, status, source, submitted_by, reviewed_by) VALUES
  ('Coffee Morning', 'Bore Coffi', 'Tea, coffee and homemade cakes. Everyone welcome.', 'Te, coffi a chacennau cartref. Croeso i bawb.', 'Village Hall', 'Neuadd y Pentref', '2026-11-04T10:00', '2026-11-04T12:00', 'approved', 'moderator', 1, 1),
  ('Remembrance Sunday', 'Sul y Cofio', 'Service at the memorial. Wreaths laid at 11am.', 'Gwasanaeth wrth y gofeb. Gosodir torchau am 11yb.', 'War Memorial', 'Y Gofeb Ryfel', '2026-11-08T10:45', '2026-11-08T12:00', 'approved', 'moderator', 1, 1),
  ('Quiz Night', 'Noson Gwis', 'Teams of up to six. Raising money for the hall.', 'Timau o hyd at chwech. Codi arian at y neuadd.', 'Village Hall', 'Neuadd y Pentref', '2026-11-13T19:30', '2026-11-13T22:00', 'approved', 'moderator', 2, 2),
  ('Christmas Fair', 'Ffair Nadolig', 'Local crafts, food stalls, raffle and a visit from Siôn Corn.', 'Crefftau lleol, stondinau bwyd, raffl ac ymweliad gan Siôn Corn.', 'Village Hall', 'Neuadd y Pentref', '2026-11-28T11:00', '2026-11-28T15:00', 'approved', 'moderator', 1, 1),
  ('Christmas Concert', 'Cyngerdd Nadolig', 'The choir and local performers.', 'Y côr a pherfformwyr lleol.', 'St Sannan''s Church', 'Eglwys Sant Sannan', '2026-12-12T19:00', '2026-12-12T21:00', 'approved', 'moderator', 2, 2);

INSERT INTO news (title_en, title_cy, summary_en, summary_cy, body_en, body_cy, category_en, category_cy, status, submitted_by, reviewed_by, published_at) VALUES
  ('Christmas lights switch-on planned', 'Cynllun i gynnau goleuadau Nadolig', 'The lights will be switched on in the village on Saturday 5 December.', 'Bydd y goleuadau''n cael eu cynnau yn y pentref ddydd Sadwrn 5 Rhagfyr.', 'Volunteers are needed the weekend before. Mince pies and hot drinks after the switch-on.', 'Mae angen gwirfoddolwyr y penwythnos cynt. Mins peis a diodydd poeth ar ôl y cynnau.', 'Community', 'Cymuned', 'approved', 1, 1, '2026-10-27T09:00:00.000Z'),
  ('Volunteers wanted for the Christmas Fair', 'Angen gwirfoddolwyr ar gyfer y Ffair Nadolig', 'Help with stalls, the raffle or teas on Saturday 28 November.', 'Helpu gyda stondinau, y raffl neu''r te ddydd Sadwrn 28 Tachwedd.', 'Even an hour makes a difference. Please get in touch through the website.', 'Mae hyd yn oed awr yn gwneud gwahaniaeth. Cysylltwch drwy''r wefan.', 'Volunteering', 'Gwirfoddoli', 'approved', 2, 2, '2026-10-20T09:00:00.000Z');

INSERT INTO weekly (title_en, title_cy, description_en, location_en, location_cy, day, start_time, end_time, week_of_month, status, submitted_by, reviewed_by) VALUES
  ('Welsh class for beginners', 'Dosbarth Cymraeg i ddechreuwyr', 'Friendly class for adults. Free.', 'Village Hall', 'Neuadd y Pentref', 2, '19:00', '20:30', NULL, 'approved', 1, 1),
  ('Coffee morning', 'Bore coffi', 'Tea, coffee and cake.', 'Village Hall', 'Neuadd y Pentref', 3, '10:00', '12:00', 1, 'approved', 1, 1);
