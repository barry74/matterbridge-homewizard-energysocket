# matterbridge-homewizard-energysocket

HomeWizard Energy Socket als Matter-stopcontact in Matterbridge, met live wattage.

## Installeren in Matterbridge

```bash
cd ~/Matterbridge
git clone https://github.com/barry74/matterbridge-homewizard-energysocket.git
cd matterbridge-homewizard-energysocket
npm install
npm run build
```

In de Matterbridge-frontend: Plugins, Add plugin, kies deze map of de npm-naam `matterbridge-homewizard-energysocket`.

Config:

```json
{
  "name": "HomeWizard Energy Socket",
  "type": "DynamicPlatform",
  "pollSeconds": 5,
  "sockets": [
    { "name": "Kachel badkamer", "ip": "10.0.11.199" },
    { "name": "Kachel woonkamer", "ip": "10.0.11.212" }
  ]
}
```

Zet de lokale API aan in de HomeWizard Energy-app. Koppel Matterbridge zelf eenmalig met Apple Home. Het wattage staat op deze Matter-stopcontacten, en op een Homebridge-tegel.

De socket levert geen spanning. De plugin vult 230 V in. Stroom wordt uit het vermogen berekend. Totaalverbruik komt uit `total_power_import_t1_kwh`.
