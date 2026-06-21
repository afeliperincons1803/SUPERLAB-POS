INSERT INTO categories (name, color, icon) VALUES
('Bebidas del Lab', '#2E6BE6', '🧪'),
('La Barra', '#E8450A', '⚗️'),
('Comida', '#22C55E', '🥪')
ON CONFLICT (name) DO NOTHING;
INSERT INTO toppings (name, group_name) VALUES
('Fresa','Frutas'),('Mango','Frutas'),('Sandía','Frutas'),('Kiwi','Frutas'),
('Arándanos','Frutas'),('Frambuesa','Frutas'),('Mora','Frutas'),('Cereza','Frutas'),
('Piña','Frutas'),('Uva','Frutas'),('Gomitas Osito','Dulces'),('Gomitas Agrias','Dulces'),
('Malvaviscos','Dulces'),('Chocolatinas','Dulces'),('Galleta Oreo','Crunch'),
('Granola','Crunch'),('Cereal Colorido','Crunch'),('Coco Rallado','Crunch'),
('Perlas de Tapioca','Perlas'),('Perlas de Fruta','Perlas'),('Perlas Explosivas','Perlas'),
('Salsa Chamoy','Salsas'),('Salsa Tajín','Salsas'),('Salsa Chocolate','Salsas'),
('Salsa Caramelo','Salsas'),('Salsa Fresa','Salsas'),('Proteína Vainilla','Boosters'),
('Colágeno','Boosters'),('Energizante','Boosters'),('Vitamina C','Boosters')
ON CONFLICT (name) DO NOTHING;
