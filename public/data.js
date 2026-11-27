/*
 * Draft 100 — base de dados e regras compartilhadas (servidor e navegador)
 *
 * Cada jogador é uma linha:
 *   ['Nome', 'POSIÇÕES', OVERALL, 'CARACTERÍSTICAS', 'NÚMERO', ANO, 'TIME DA ÉPOCA']
 *
 *   POSIÇÕES: PG, SG, SF, PF, C. Pode ter mais de uma, separadas por "/" (a primeira é a principal).
 *             Jogar nelas não tem penalidade. Fora delas, perde rendimento.
 *   OVERALL:  60 a 99.
 *   CARACTERÍSTICAS: letras em ORDEM DE FORÇA (a 1ª pesa mais, depois a 2ª, depois a 3ª):
 *      S = Bola de 3          M = Meia distância      I = Infiltrador
 *      G = Jogo de garrafão   X = Pontuador           P = Passe mágico
 *      R = Reboteiro          D = Defesa / roubos     B = Protetor de aro
 *      C = Decisivo (cresce no fim do jogo)
 *   NÚMERO, ANO e TIME DA ÉPOCA são opcionais (usados na camisa do card).
 */
(function (root) {
  const TEAMS = [
    { id: 'ATL', city: 'Atlanta', name: 'Hawks', c1: '#E03A3E', c2: '#FDB927' },
    { id: 'BOS', city: 'Boston', name: 'Celtics', c1: '#007A33', c2: '#BA9653' },
    { id: 'BKN', city: 'Brooklyn', name: 'Nets', c1: '#2b2b2b', c2: '#ffffff' },
    { id: 'CHA', city: 'Charlotte', name: 'Hornets', c1: '#1D1160', c2: '#00788C' },
    { id: 'CHI', city: 'Chicago', name: 'Bulls', c1: '#CE1141', c2: '#1a1a1a' },
    { id: 'CLE', city: 'Cleveland', name: 'Cavaliers', c1: '#860038', c2: '#FDBB30' },
    { id: 'DAL', city: 'Dallas', name: 'Mavericks', c1: '#00538C', c2: '#B8C4CA' },
    { id: 'DEN', city: 'Denver', name: 'Nuggets', c1: '#0E2240', c2: '#FEC524' },
    { id: 'DET', city: 'Detroit', name: 'Pistons', c1: '#C8102E', c2: '#1D42BA' },
    { id: 'GSW', city: 'Golden State', name: 'Warriors', c1: '#1D428A', c2: '#FFC72C' },
    { id: 'HOU', city: 'Houston', name: 'Rockets', c1: '#CE1141', c2: '#C4CED4' },
    { id: 'IND', city: 'Indiana', name: 'Pacers', c1: '#002D62', c2: '#FDBB30' },
    { id: 'LAC', city: 'LA', name: 'Clippers', c1: '#C8102E', c2: '#1D428A' },
    { id: 'LAL', city: 'Los Angeles', name: 'Lakers', c1: '#552583', c2: '#FDB927' },
    { id: 'MEM', city: 'Memphis', name: 'Grizzlies', c1: '#5D76A9', c2: '#12173F' },
    { id: 'MIA', city: 'Miami', name: 'Heat', c1: '#98002E', c2: '#F9A01B' },
    { id: 'MIL', city: 'Milwaukee', name: 'Bucks', c1: '#00471B', c2: '#EEE1C6' },
    { id: 'MIN', city: 'Minnesota', name: 'Timberwolves', c1: '#0C2340', c2: '#78BE20' },
    { id: 'NOP', city: 'New Orleans', name: 'Pelicans', c1: '#0C2340', c2: '#C8102E' },
    { id: 'NYK', city: 'New York', name: 'Knicks', c1: '#006BB6', c2: '#F58426' },
    { id: 'OKC', city: 'Oklahoma City', name: 'Thunder', c1: '#007AC1', c2: '#EF3B24' },
    { id: 'ORL', city: 'Orlando', name: 'Magic', c1: '#0077C0', c2: '#C4CED4' },
    { id: 'PHI', city: 'Philadelphia', name: '76ers', c1: '#006BB6', c2: '#ED174C' },
    { id: 'PHX', city: 'Phoenix', name: 'Suns', c1: '#1D1160', c2: '#E56020' },
    { id: 'POR', city: 'Portland', name: 'Trail Blazers', c1: '#E03A3E', c2: '#1a1a1a' },
    { id: 'SAC', city: 'Sacramento', name: 'Kings', c1: '#5A2D81', c2: '#63727A' },
    { id: 'SAS', city: 'San Antonio', name: 'Spurs', c1: '#3a3a3a', c2: '#C4CED4' },
    { id: 'TOR', city: 'Toronto', name: 'Raptors', c1: '#CE1141', c2: '#A1A1A4' },
    { id: 'UTA', city: 'Utah', name: 'Jazz', c1: '#002B5C', c2: '#F9A01B' },
    { id: 'WAS', city: 'Washington', name: 'Wizards', c1: '#002B5C', c2: '#E31837' },
  ];
  // franquias antigas (só para as camisas das lendas)
  const OLD_TEAMS = {
    SEA: { c1: '#00653A', c2: '#FFC200' }, NJN: { c1: '#002A60', c2: '#CD1041' }, CIN: { c1: '#0046AD', c2: '#E31837' },
    STL: { c1: '#C8102E', c2: '#0C2340' }, BUF: { c1: '#002B5C', c2: '#F58426' }, NOJ: { c1: '#5A2D81', c2: '#F9A01B' },
    BAL: { c1: '#0C2340', c2: '#E31837' }, WSB: { c1: '#002B5C', c2: '#E31837' }, SFW: { c1: '#1D428A', c2: '#FFC72C' },
    PHW: { c1: '#1D428A', c2: '#FFC72C' }, NOH: { c1: '#00778B', c2: '#3E1F5B' },
    VAN: { c1: '#00B2A9', c2: '#E43C40' }, KCK: { c1: '#1D428A', c2: '#C8102E' }, SYR: { c1: '#5B2B82', c2: '#F2A900' }, MNL: { c1: '#1D428A', c2: '#FDB927' },
  };

  // ---------- NBA ATUAL ----------
  const ATUAL = [
    ['Nikola Jokić', 'C', 98, 'PGR', '15'],
    ['Shai Gilgeous-Alexander', 'PG/SG', 97, 'XMD', '2'],
    ['Luka Dončić', 'PG/SG', 96, 'XPS', '77'],
    ['Giannis Antetokounmpo', 'PF/C', 96, 'IRB', '34'],
    ['Victor Wembanyama', 'C/PF', 95, 'BRS', '1'],
    ['Anthony Edwards', 'SG/SF', 93, 'XIS', '5'],
    ['Jayson Tatum', 'SF/PF', 92, 'XSR', '0'],
    ['Stephen Curry', 'PG', 92, 'SXC', '30'],
    ['Cade Cunningham', 'PG', 91, 'PXM', '2'],
    ['Jalen Brunson', 'PG', 91, 'MCX', '11'],
    ['Donovan Mitchell', 'SG/PG', 91, 'XSC', '45'],
    ['Kevin Durant', 'SF/PF', 91, 'MXS', '7'],
    ['Joel Embiid', 'C', 90, 'GXR', '21'],
    ['Anthony Davis', 'PF/C', 90, 'BRG', '3'],
    ['Devin Booker', 'SG', 90, 'MXP', '1'],
    ['Kawhi Leonard', 'SF', 90, 'DMC', '2'],
    ['LeBron James', 'SF/PF/PG', 89, 'PIX', '23'],
    ['Jalen Williams', 'SF/SG', 89, 'XDM', '8'],
    ['Evan Mobley', 'PF/C', 89, 'BRI', '4'],
    ['Jaylen Brown', 'SG/SF', 89, 'IXD', '7'],
    ['Karl-Anthony Towns', 'C/PF', 89, 'SRG', '32'],
    ['Tyrese Haliburton', 'PG', 89, 'PS', '0'],
    ['Chet Holmgren', 'C/PF', 88, 'BSR', '7'],
    ['Alperen Şengün', 'C', 88, 'GPR', '28'],
    ['Domantas Sabonis', 'C/PF', 88, 'RPG', '11'],
    ['Paolo Banchero', 'PF/SF', 88, 'XIR', '5'],
    ['Tyrese Maxey', 'PG/SG', 88, 'XIS', '0'],
    ['Trae Young', 'PG', 88, 'PSX', '11'],
    ['Kyrie Irving', 'PG/SG', 88, 'IMC', '11'],
    ['Ja Morant', 'PG', 87, 'IX', '12'],
    ['Jimmy Butler', 'SF/PF', 87, 'DCI', '22'],
    ['Bam Adebayo', 'C/PF', 87, 'BDR', '13'],
    ['James Harden', 'PG/SG', 87, 'PSX', '1'],
    ['De\'Aaron Fox', 'PG', 87, 'ICD', '4'],
    ['Franz Wagner', 'SF/PF', 87, 'IX', '22'],
    ['Pascal Siakam', 'PF/SF', 87, 'IXP', '43'],
    ['LaMelo Ball', 'PG', 87, 'PS', '1'],
    ['Jamal Murray', 'PG', 87, 'CMS', '27'],
    ['Jalen Johnson', 'PF/SF', 87, 'RPI', '1'],
    ['Damian Lillard', 'PG', 86, 'SCX', '0'],
    ['Zion Williamson', 'PF', 86, 'IGR', '1'],
    ['Jaren Jackson Jr.', 'PF/C', 86, 'BS', '13'],
    ['Scottie Barnes', 'SF/PF', 86, 'PDR', '4'],
    ['Amen Thompson', 'SF/SG', 86, 'DIR', '1'],
    ['Austin Reaves', 'SG/PG', 86, 'SPI', '15'],
    ['Paul George', 'SF', 85, 'SD', '8'],
    ['Desmond Bane', 'SG', 85, 'S', '22'],
    ['Mikal Bridges', 'SF/SG', 85, 'DS', '25'],
    ['OG Anunoby', 'SF/PF', 85, 'DS', '8'],
    ['Darius Garland', 'PG', 85, 'PS', '10'],
    ['Lauri Markkanen', 'PF', 85, 'SX', '23'],
    ['Zach LaVine', 'SG', 85, 'SI', '8'],
    ['Rudy Gobert', 'C', 85, 'BR', '27'],
    ['Derrick White', 'SG/PG', 85, 'DS', '9'],
    ['Cooper Flagg', 'SF/PF', 85, 'DIX', '32'],
    ['Deni Avdija', 'SF', 85, 'IPR', '8'],
    ['Tyler Herro', 'SG', 85, 'SM', '14'],
    ['Jarrett Allen', 'C', 84, 'RB', '31'],
    ['Ivica Zubac', 'C', 84, 'RB', '40'],
    ['Brandon Ingram', 'SF', 84, 'MX', '3'],
    ['Kristaps Porziņģis', 'C/PF', 84, 'SB', '8'],
    ['Dyson Daniels', 'SG/PG', 84, 'D', '5'],
    ['Josh Giddey', 'PG', 84, 'PR', '3'],
    ['Norman Powell', 'SG', 84, 'SX', '24'],
    ['Michael Porter Jr.', 'SF', 84, 'SR', '1'],
    ['Julius Randle', 'PF', 84, 'IGR', '30'],
    ['Jalen Duren', 'C', 84, 'RI', '0'],
    ['Brandon Miller', 'SF', 84, 'SX', '24'],
    ['Trey Murphy III', 'SF', 84, 'S', '25'],
    ['Myles Turner', 'C', 83, 'BS', '3'],
    ['Jrue Holiday', 'PG/SG', 83, 'DP', '4'],
    ['Jalen Green', 'SG', 83, 'XI', '4'],
    ['DeMar DeRozan', 'SF', 83, 'MC', '10'],
    ['Aaron Gordon', 'PF', 83, 'ID', '50'],
    ['Coby White', 'PG/SG', 83, 'S', '0'],
    ['Stephon Castle', 'SG/PG', 82, 'DI', '5'],
    ['Fred VanVleet', 'PG', 82, 'SPD', '5'],
    ['Josh Hart', 'SG/SF', 82, 'RD', '3'],
    ['Jaden McDaniels', 'SF/PF', 82, 'D', '3'],
    ['Anfernee Simons', 'SG', 82, 'S', '1'],
    ['CJ McCollum', 'SG', 82, 'MS', '3'],
    ['Jabari Smith Jr.', 'PF', 82, 'SD', '10'],
    ['Walker Kessler', 'C', 82, 'BR', '24'],
    ['Isaiah Hartenstein', 'C', 82, 'RP', '55'],
    ['Ausar Thompson', 'SF', 82, 'DR', '9'],
    ['Immanuel Quickley', 'PG', 82, 'S', '5'],
    ['RJ Barrett', 'SF', 82, 'I', '9'],
    ['Dejounte Murray', 'PG', 82, 'DP', '5'],
    ['Jalen Suggs', 'SG', 82, 'D', '4'],
    ['Herbert Jones', 'SF', 81, 'D', '5'],
    ['Bradley Beal', 'SG', 81, 'MS', '3'],
    ['Onyeka Okongwu', 'C', 81, 'BR', '17'],
    ['Keegan Murray', 'PF', 81, 'SD', '13'],
    ['Jonathan Kuminga', 'PF/SF', 81, 'I', '1'],
    ['Draymond Green', 'PF/C', 81, 'DPR', '23'],
    ['Naz Reid', 'C/PF', 81, 'S', '11'],
    ['Christian Braun', 'SG', 81, 'D', '0'],
    ['Payton Pritchard', 'PG', 81, 'S', '11'],
    ['Shaedon Sharpe', 'SG', 81, 'I', '17'],
    ['Nikola Vučević', 'C', 81, 'RS', '9'],
    ['Luguentz Dort', 'SG/SF', 80, 'D', '5'],
    ['Khris Middleton', 'SF', 80, 'MS', '22'],
    ['Nic Claxton', 'C', 80, 'B', '33'],
    ['De\'Andre Hunter', 'SF', 80, 'S', '12'],
    ['Mark Williams', 'C', 80, 'RB', '5'],
    ['Collin Sexton', 'PG/SG', 80, 'XI', '2'],
    ['Malik Monk', 'SG', 80, 'S', '0'],
    ['Andrew Wiggins', 'SF', 80, 'D', '22'],
    ['Kel\'el Ware', 'C', 80, 'RB', '7'],
    ['Cam Thomas', 'SG', 80, 'XM', '24'],
    ['Dereck Lively II', 'C', 80, 'BR', '2'],
    ['Zach Edey', 'C', 80, 'RG', '14'],
    ['Bennedict Mathurin', 'SG/SF', 80, 'I', '00'],
    ['Andrew Nembhard', 'PG', 80, 'PD', '2'],
    ['Devin Vassell', 'SG', 80, 'S', '24'],
    ['Toumani Camara', 'SF', 80, 'D', '33'],
    ['Tari Eason', 'PF', 80, 'DR', '17'],
    ['Dillon Brooks', 'SF', 80, 'D', '3'],
    ['Kon Knueppel', 'SF/SG', 80, 'S', '7'],
    ['Keyonte George', 'PG', 80, 'S', '3'],
    ['Deandre Ayton', 'C', 80, 'RG', '5'],
    ['Miles Bridges', 'SF/PF', 80, 'I', '0'],
    ['Jakob Pöltl', 'C', 80, 'R', '19'],
    ['Nickeil Alexander-Walker', 'SG', 80, 'SD', '9'],
    ['Daniel Gafford', 'C', 79, 'BR', '21'],
    ['Jordan Poole', 'SG', 79, 'S', '3'],
    ['Kyle Kuzma', 'PF', 79, 'S', '18'],
    ['Bobby Portis', 'PF', 79, 'SR', '9'],
    ['Tobias Harris', 'PF', 79, 'M', '12'],
    ['Klay Thompson', 'SG', 79, 'S', '31'],
    ['Al Horford', 'C', 79, 'SB', '42'],
    ['Brook Lopez', 'C', 79, 'BS', '11'],
    ['Russell Westbrook', 'PG', 79, 'PRI', '18'],
    ['Jaime Jaquez Jr.', 'SF', 79, 'I', '11'],
    ['Aaron Nesmith', 'SF', 79, 'SD', '23'],
    ['Alex Caruso', 'SG', 79, 'D', '9'],
    ['Jaden Ivey', 'SG', 79, 'I', '23'],
    ['Alex Sarr', 'C', 79, 'B', '20'],
    ['VJ Edgecombe', 'SG', 79, 'I', '77'],
    ['Jerami Grant', 'PF', 79, 'S', '9'],
    ['Ty Jerome', 'SG', 79, 'S', '2'],
    ['Quentin Grimes', 'SG', 79, 'S', '5'],
    ['Mitchell Robinson', 'C', 78, 'RB', '23'],
    ['Marcus Smart', 'PG', 78, 'D', '36'],
    ['Kelly Oubre Jr.', 'SF', 78, 'I', '9'],
    ['Keldon Johnson', 'SF', 78, 'I', '0'],
    ['Bogdan Bogdanović', 'SG', 78, 'S', ''],
    ['Zaccharie Risacher', 'SF', 78, 'S', '10'],
    ['Matas Buzelis', 'SF', 78, 'I', '14'],
    ['Dylan Harper', 'PG', 78, 'IP', '2'],
    ['Max Christie', 'SG', 78, 'S', '00'],
    ['Clint Capela', 'C', 77, 'RB', '15'],
    ['Steven Adams', 'C', 77, 'R', '12'],
    ['Mike Conley', 'PG', 77, 'PS', '10'],
    ['Kevin Huerter', 'SG', 77, 'S', '9'],
    ['Grayson Allen', 'SG', 77, 'S', '8'],
    ['Scoot Henderson', 'PG', 77, 'P', '00'],
    ['Jusuf Nurkić', 'C', 77, 'R', ''],
    ['Ace Bailey', 'SF', 77, 'M', ''],
    ['Bilal Coulibaly', 'SF', 77, 'D', '0'],
    ['Reed Sheppard', 'PG', 76, 'S', '15'],
    ['Lonzo Ball', 'PG', 76, 'PD', '2'],
  ];

  // ---------- LENDAS (cada linha é uma temporada; a mesma lenda pode ter várias versões) ----------
  // Só uma versão de cada jogador entra em cada leilão.
  const LENDAS = [
    ['Michael Jordan', 'SG/SF', 89, 'XI', '23', 1985, 'CHI'],
    ['Michael Jordan', 'SG/SF', 97, 'XDI', '23', 1988, 'CHI'],
    ['Michael Jordan', 'SG/SF', 98, 'XCD', '23', 1991, 'CHI'],
    ['Michael Jordan', 'SG/SF', 99, 'XCD', '23', 1996, 'CHI'],
    ['Michael Jordan', 'SG/SF', 96, 'MCX', '23', 1998, 'CHI'],
    ['Michael Jordan', 'SF/SG', 84, 'MC', '23', 2003, 'WAS'],
    ['LeBron James', 'SF/PF', 87, 'IX', '23', 2004, 'CLE'],
    ['LeBron James', 'SF/PF/PG', 97, 'IPX', '23', 2009, 'CLE'],
    ['LeBron James', 'SF/PF/PG', 98, 'PIX', '6', 2013, 'MIA'],
    ['LeBron James', 'SF/PF/PG', 96, 'PIC', '23', 2016, 'CLE'],
    ['LeBron James', 'PG/SF/PF', 94, 'PIX', '23', 2020, 'LAL'],
    ['Kareem Abdul-Jabbar', 'C', 96, 'GXR', '33', 1971, 'MIL'],
    ['Kareem Abdul-Jabbar', 'C', 97, 'GXB', '33', 1977, 'LAL'],
    ['Kareem Abdul-Jabbar', 'C', 88, 'G', '33', 1987, 'LAL'],
    ['Magic Johnson', 'PG/SF', 90, 'PRI', '32', 1980, 'LAL'],
    ['Magic Johnson', 'PG/SF', 97, 'PRI', '32', 1987, 'LAL'],
    ['Magic Johnson', 'PG/SF', 96, 'PRS', '32', 1990, 'LAL'],
    ['Larry Bird', 'SF/PF', 93, 'RPS', '33', 1981, 'BOS'],
    ['Larry Bird', 'SF/PF', 96, 'SPC', '33', 1984, 'BOS'],
    ['Larry Bird', 'SF/PF', 97, 'SPC', '33', 1986, 'BOS'],
    ['Shaquille O\'Neal', 'C', 92, 'GRB', '32', 1994, 'ORL'],
    ['Shaquille O\'Neal', 'C', 97, 'GRX', '34', 2000, 'LAL'],
    ['Shaquille O\'Neal', 'C', 89, 'GR', '32', 2006, 'MIA'],
    ['Wilt Chamberlain', 'C', 96, 'RXG', '13', 1962, 'PHW'],
    ['Wilt Chamberlain', 'C', 96, 'RPG', '13', 1967, 'PHI'],
    ['Wilt Chamberlain', 'C', 90, 'RB', '13', 1972, 'LAL'],
    ['Kobe Bryant', 'SG/SF', 92, 'XI', '8', 2001, 'LAL'],
    ['Kobe Bryant', 'SG/SF', 96, 'XMC', '8', 2006, 'LAL'],
    ['Kobe Bryant', 'SG/SF', 95, 'XMC', '24', 2008, 'LAL'],
    ['Kobe Bryant', 'SG/SF', 95, 'CMX', '24', 2010, 'LAL'],
    ['Tim Duncan', 'PF/C', 90, 'GR', '21', 1998, 'SAS'],
    ['Tim Duncan', 'PF/C', 96, 'GBR', '21', 2003, 'SAS'],
    ['Tim Duncan', 'PF/C', 88, 'GP', '21', 2014, 'SAS'],
    ['Hakeem Olajuwon', 'C', 91, 'BRG', '34', 1986, 'HOU'],
    ['Hakeem Olajuwon', 'C', 96, 'GBD', '34', 1994, 'HOU'],
    ['Stephen Curry', 'PG', 95, 'SPX', '30', 2015, 'GSW'],
    ['Stephen Curry', 'PG', 96, 'SXP', '30', 2016, 'GSW'],
    ['Stephen Curry', 'PG', 94, 'SX', '30', 2021, 'GSW'],
    ['Kevin Durant', 'SF/PF', 95, 'XMS', '35', 2014, 'OKC'],
    ['Kevin Durant', 'SF/PF', 95, 'MSX', '35', 2017, 'GSW'],
    ['Bill Russell', 'C', 94, 'BRP', '6', 1962, 'BOS'],
    ['Bill Russell', 'C', 94, 'BRD', '6', 1965, 'BOS'],
    ['Kevin Garnett', 'PF/C', 94, 'BRM', '21', 2004, 'MIN'],
    ['Kevin Garnett', 'PF/C', 92, 'BDR', '5', 2008, 'BOS'],
    ['Dirk Nowitzki', 'PF', 94, 'MSX', '41', 2007, 'DAL'],
    ['Dirk Nowitzki', 'PF', 94, 'MCS', '41', 2011, 'DAL'],
    ['Oscar Robertson', 'PG/SG', 94, 'PRX', '14', 1962, 'CIN'],
    ['Oscar Robertson', 'PG/SG', 94, 'PXR', '14', 1964, 'CIN'],
    ['David Robinson', 'C', 94, 'BRX', '50', 1995, 'SAS'],
    ['David Robinson', 'C', 88, 'BR', '50', 1999, 'SAS'],
    ['Kawhi Leonard', 'SF', 86, 'D', '2', 2014, 'SAS'],
    ['Kawhi Leonard', 'SF', 94, 'DMC', '2', 2019, 'TOR'],
    ['James Harden', 'SG', 86, 'IS', '13', 2012, 'OKC'],
    ['James Harden', 'SG/PG', 94, 'XSP', '13', 2018, 'HOU'],
    ['Giannis Antetokounmpo', 'PF/C', 95, 'IRB', '34', 2019, 'MIL'],
    ['Giannis Antetokounmpo', 'PF/C', 96, 'IRB', '34', 2020, 'MIL'],
    ['Nikola Jokić', 'C', 96, 'PGR', '15', 2021, 'DEN'],
    ['Nikola Jokić', 'C', 97, 'PGR', '15', 2022, 'DEN'],
    ['Joel Embiid', 'C', 94, 'GXR', '21', 2023, 'PHI'],
    ['Shai Gilgeous-Alexander', 'PG/SG', 97, 'XMD', '2', 2025, 'OKC'],
    ['Jerry West', 'PG/SG', 93, 'CMD', '44', 1970, 'LAL'],
    ['Jerry West', 'PG/SG', 92, 'PCM', '44', 1972, 'LAL'],
    ['Julius Erving', 'SF', 93, 'IX', '6', 1981, 'PHI'],
    ['Karl Malone', 'PF', 93, 'GXR', '32', 1997, 'UTA'],
    ['Karl Malone', 'PF', 92, 'GXR', '32', 1999, 'UTA'],
    ['Charles Barkley', 'PF', 92, 'RIG', '34', 1988, 'PHI'],
    ['Charles Barkley', 'PF', 93, 'RIG', '34', 1993, 'PHX'],
    ['Dwyane Wade', 'SG', 93, 'IDC', '3', 2006, 'MIA'],
    ['Dwyane Wade', 'SG', 94, 'XID', '3', 2009, 'MIA'],
    ['Chris Paul', 'PG', 93, 'PDM', '3', 2008, 'NOH'],
    ['Chris Paul', 'PG', 91, 'PMD', '3', 2015, 'LAC'],
    ['Elgin Baylor', 'SF', 92, 'XRI', '22', 1962, 'LAL'],
    ['Moses Malone', 'C', 91, 'RG', '24', 1979, 'HOU'],
    ['Moses Malone', 'C', 92, 'RG', '2', 1983, 'PHI'],
    ['Patrick Ewing', 'C', 92, 'GBM', '33', 1990, 'NYK'],
    ['Scottie Pippen', 'SF/SG', 89, 'DP', '33', 1991, 'CHI'],
    ['Scottie Pippen', 'SF/SG', 92, 'DPI', '33', 1994, 'CHI'],
    ['Isiah Thomas', 'PG', 92, 'PIC', '11', 1989, 'DET'],
    ['Allen Iverson', 'SG/PG', 92, 'XID', '3', 2001, 'PHI'],
    ['Allen Iverson', 'PG/SG', 91, 'XIP', '3', 2005, 'PHI'],
    ['Steve Nash', 'PG', 91, 'PS', '13', 2005, 'PHX'],
    ['Steve Nash', 'PG', 92, 'PSM', '13', 2006, 'PHX'],
    ['Tracy McGrady', 'SF/SG', 92, 'XMS', '1', 2003, 'ORL'],
    ['Russell Westbrook', 'PG', 92, 'XRP', '0', 2017, 'OKC'],
    ['Derrick Rose', 'PG', 91, 'IX', '1', 2011, 'CHI'],
    ['John Stockton', 'PG', 90, 'PD', '12', 1990, 'UTA'],
    ['John Stockton', 'PG', 91, 'PD', '12', 1997, 'UTA'],
    ['Jason Kidd', 'PG', 91, 'PRD', '5', 2002, 'NJN'],
    ['Jason Kidd', 'PG', 82, 'SP', '2', 2011, 'DAL'],
    ['Gary Payton', 'PG', 91, 'DP', '20', 1996, 'SEA'],
    ['Dwight Howard', 'C', 91, 'BRI', '12', 2009, 'ORL'],
    ['Dwight Howard', 'C', 80, 'BR', '39', 2020, 'LAL'],
    ['Clyde Drexler', 'SG/SF', 91, 'IX', '22', 1992, 'POR'],
    ['Rick Barry', 'SF', 91, 'XSP', '24', 1975, 'GSW'],
    ['Bob Pettit', 'PF', 91, 'RX', '9', 1959, 'STL'],
    ['John Havlicek', 'SF/SG', 91, 'DX', '17', 1974, 'BOS'],
    ['Paul George', 'SF', 91, 'SD', '13', 2019, 'OKC'],
    ['Paul Pierce', 'SF', 90, 'XMC', '34', 2008, 'BOS'],
    ['Ray Allen', 'SG', 90, 'SC', '34', 2001, 'MIL'],
    ['Ray Allen', 'SG', 82, 'SC', '34', 2013, 'MIA'],
    ['Vince Carter', 'SG/SF', 90, 'IX', '15', 2001, 'TOR'],
    ['Dominique Wilkins', 'SF', 90, 'IX', '21', 1988, 'ATL'],
    ['George Gervin', 'SG', 90, 'XM', '44', 1980, 'SAS'],
    ['Kevin McHale', 'PF', 90, 'GB', '32', 1987, 'BOS'],
    ['Yao Ming', 'C', 90, 'GRB', '11', 2009, 'HOU'],
    ['Bob McAdoo', 'C/PF', 90, 'XM', '11', 1975, 'BUF'],
    ['Reggie Miller', 'SG', 89, 'SC', '31', 1998, 'IND'],
    ['Carmelo Anthony', 'SF', 89, 'XM', '15', 2007, 'DEN'],
    ['Carmelo Anthony', 'SF/PF', 90, 'XMS', '7', 2013, 'NYK'],
    ['Pete Maravich', 'PG/SG', 89, 'XP', '7', 1977, 'NOJ'],
    ['Walt Frazier', 'PG', 89, 'DP', '10', 1970, 'NYK'],
    ['Alonzo Mourning', 'C', 89, 'BR', '33', 1996, 'MIA'],
    ['Pau Gasol', 'PF/C', 89, 'GPR', '16', 2010, 'LAL'],
    ['Chris Webber', 'PF', 89, 'PRG', '4', 2001, 'SAC'],
    ['Grant Hill', 'SF', 89, 'PI', '33', 1997, 'DET'],
    ['Penny Hardaway', 'PG/SG', 89, 'PI', '1', 1996, 'ORL'],
    ['James Worthy', 'SF', 89, 'IC', '42', 1988, 'LAL'],
    ['Willis Reed', 'C', 89, 'RG', '19', 1970, 'NYK'],
    ['Elvin Hayes', 'PF/C', 89, 'RG', '11', 1978, 'WSB'],
    ['Bernard King', 'SF', 89, 'XM', '30', 1985, 'NYK'],
    ['Dave Cowens', 'C', 89, 'RD', '18', 1973, 'BOS'],
    ['Bill Walton', 'C', 89, 'PBR', '32', 1978, 'POR'],
    ['Klay Thompson', 'SG', 89, 'SD', '11', 2016, 'GSW'],
    ['Blake Griffin', 'PF', 89, 'IR', '32', 2014, 'LAC'],
    ['Bob Cousy', 'PG', 88, 'P', '14', 1957, 'BOS'],
    ['Dennis Rodman', 'PF', 88, 'RD', '10', 1992, 'DET'],
    ['Dennis Rodman', 'PF', 88, 'RD', '91', 1996, 'CHI'],
    ['Dikembe Mutombo', 'C', 88, 'BR', '55', 1997, 'ATL'],
    ['Tony Parker', 'PG', 88, 'IP', '9', 2007, 'SAS'],
    ['Manu Ginóbili', 'SG', 88, 'ICS', '20', 2005, 'SAS'],
    ['Chris Mullin', 'SF', 88, 'SM', '17', 1990, 'GSW'],
    ['Nate Thurmond', 'C', 88, 'RB', '42', 1967, 'SFW'],
    ['Kevin Johnson', 'PG', 88, 'IP', '7', 1990, 'PHX'],
    ['Tim Hardaway', 'PG', 88, 'PS', '10', 1997, 'MIA'],
    ['Shawn Kemp', 'PF', 88, 'IR', '40', 1996, 'SEA'],
    ['Arvydas Sabonis', 'C', 88, 'PG', '11', 1996, 'POR'],
    ['Chris Bosh', 'PF/C', 88, 'MS', '1', 2013, 'MIA'],
    ['Kevin Love', 'PF', 88, 'RS', '42', 2014, 'MIN'],
    ['Draymond Green', 'PF/C', 88, 'DP', '23', 2016, 'GSW'],
    ['Ben Wallace', 'C', 87, 'BR', '3', 2004, 'DET'],
    ['Amar\'e Stoudemire', 'PF/C', 87, 'IG', '32', 2005, 'PHX'],
    ['Wes Unseld', 'C', 87, 'RP', '41', 1969, 'BAL'],
    ['Adrian Dantley', 'SF', 87, 'GX', '4', 1984, 'UTA'],
    ['Sam Jones', 'SG', 87, 'MS', '24', 1965, 'BOS'],
    ['Artis Gilmore', 'C', 87, 'RB', '53', 1978, 'CHI'],
    ['Robert Parish', 'C', 87, 'RG', '00', 1985, 'BOS'],
    ['Joe Dumars', 'SG', 87, 'DM', '4', 1989, 'DET'],
    ['Sidney Moncrief', 'SG', 87, 'DI', '4', 1983, 'MIL'],
    ['Gilbert Arenas', 'PG', 87, 'XSC', '0', 2007, 'WAS'],
    ['Mark Price', 'PG', 86, 'SP', '25', 1992, 'CLE'],
    ['Dražen Petrović', 'SG', 86, 'S', '3', 1993, 'NJN'],
    ['Peja Stojaković', 'SF', 86, 'S', '16', 2004, 'SAC'],
    ['Dennis Johnson', 'SG/PG', 86, 'DC', '3', 1986, 'BOS'],
    ['Rasheed Wallace', 'PF/C', 86, 'DS', '36', 2004, 'DET'],
    ['Jermaine O\'Neal', 'PF/C', 86, 'BR', '7', 2004, 'IND'],
    ['Ron Artest', 'SF', 86, 'D', '', 2004, 'IND'],
    ['Shawn Marion', 'SF/PF', 86, 'DR', '31', 2005, 'PHX'],
    ['Vlade Divac', 'C', 85, 'P', '21', 2001, 'SAC'],
    ['Steve Francis', 'PG', 85, 'I', '3', 2001, 'HOU'],
    ['Toni Kukoč', 'SF/PF', 85, 'PS', '7', 1996, 'CHI'],
    ['Bill Laimbeer', 'C', 84, 'RS', '40', 1988, 'DET'],
    ['Detlef Schrempf', 'SF/PF', 84, 'SP', '11', 1995, 'SEA'],
    ['Horace Grant', 'PF', 84, 'RD', '54', 1991, 'CHI'],
    ['Michael Cooper', 'SG/SF', 83, 'D', '21', 1987, 'LAL'],
    ['Robert Horry', 'PF', 83, 'CS', '5', 2005, 'SAS'],
    ['Kyle Korver', 'SG', 83, 'S', '26', 2015, 'ATL'],
    ['Steve Kerr', 'PG/SG', 81, 'S', '25', 1997, 'CHI'],
    ['Leandrinho Barbosa', 'SG', 81, 'I', '10', 2007, 'PHX'],
    ['Nenê Hilário', 'C/PF', 80, 'RG', '31', 2009, 'DEN'],
    ['Anderson Varejão', 'C/PF', 79, 'R', '17', 2010, 'CLE'],
    ['Tiago Splitter', 'C', 78, 'RG', '22', 2014, 'SAS'],
    // ----- lendas extras por franquia (para o modo "Lendas da franquia") -----
    ['Lou Hudson', 'SG/SF', 86, 'MX', '23', 1970, 'ATL'],
    ['Joe Johnson', 'SG/SF', 85, 'MSC', '2', 2010, 'ATL'],
    ['Al Horford', 'C/PF', 84, 'SBP', '15', 2016, 'ATL'],
    ['Josh Smith', 'PF/SF', 83, 'BDI', '5', 2010, 'ATL'],
    ['Mookie Blaylock', 'PG', 83, 'DS', '10', 1997, 'ATL'],
    ['Doc Rivers', 'PG', 82, 'PD', '25', 1987, 'ATL'],
    ['Paul Millsap', 'PF', 84, 'DM', '4', 2016, 'ATL'],
    ['Kevin Willis', 'PF/C', 82, 'R', '42', 1992, 'ATL'],
    ['Trae Young', 'PG', 89, 'PSX', '11', 2022, 'ATL'],
    ['Zelmo Beaty', 'C', 84, 'RG', '31', 1966, 'STL'],
    ['Cliff Hagan', 'SF', 85, 'XG', '16', 1960, 'STL'],
    ['Lenny Wilkens', 'PG', 86, 'P', '19', 1968, 'STL'],
    ['Vince Carter', 'SG/SF', 88, 'XIS', '15', 2007, 'NJN'],
    ['Buck Williams', 'PF', 85, 'RD', '52', 1983, 'NJN'],
    ['Derrick Coleman', 'PF', 86, 'IR', '44', 1993, 'NJN'],
    ['Kenyon Martin', 'PF', 84, 'ID', '6', 2004, 'NJN'],
    ['Richard Jefferson', 'SF', 83, 'I', '24', 2004, 'NJN'],
    ['Brook Lopez', 'C', 85, 'GS', '11', 2013, 'BKN'],
    ['Deron Williams', 'PG', 86, 'PS', '8', 2013, 'BKN'],
    ['Kevin Durant', 'SF/PF', 95, 'MXS', '7', 2021, 'BKN'],
    ['Kyrie Irving', 'PG/SG', 90, 'IMC', '11', 2021, 'BKN'],
    ['Jason Collins', 'C', 76, 'D', '35', 2003, 'NJN'],
    ['Otis Birdsong', 'SG', 82, 'X', '10', 1984, 'NJN'],
    ['Darryl Dawkins', 'C', 82, 'G', '53', 1983, 'NJN'],
    ['Larry Johnson', 'PF', 87, 'IR', '2', 1993, 'CHA'],
    ['Alonzo Mourning', 'C', 87, 'BR', '33', 1993, 'CHA'],
    ['Muggsy Bogues', 'PG', 81, 'PD', '1', 1994, 'CHA'],
    ['Glen Rice', 'SF', 88, 'SX', '41', 1997, 'CHA'],
    ['Dell Curry', 'SG', 80, 'S', '30', 1994, 'CHA'],
    ['Baron Davis', 'PG', 85, 'PI', '1', 2001, 'CHA'],
    ['Kemba Walker', 'PG', 88, 'XSC', '15', 2019, 'CHA'],
    ['Gerald Wallace', 'SF', 84, 'DI', '3', 2010, 'CHA'],
    ['Anthony Mason', 'PF', 82, 'RP', '14', 1997, 'CHA'],
    ['Emeka Okafor', 'C', 82, 'RB', '50', 2005, 'CHA'],
    ['Kendall Gill', 'SG', 81, 'I', '13', 1992, 'CHA'],
    ['Vlade Divac', 'C', 83, 'P', '12', 1997, 'CHA'],
    ['Eddie Jones', 'SG/SF', 85, 'DS', '6', 1999, 'CHA'],
    ['Joakim Noah', 'C', 86, 'RBP', '13', 2014, 'CHI'],
    ['Bob Love', 'SF/PF', 85, 'X', '10', 1971, 'CHI'],
    ['Jerry Sloan', 'SG', 84, 'D', '4', 1970, 'CHI'],
    ['Luol Deng', 'SF', 83, 'D', '9', 2012, 'CHI'],
    ['Jimmy Butler', 'SG/SF', 89, 'DXI', '21', 2017, 'CHI'],
    ['Norm Van Lier', 'PG', 83, 'DP', '2', 1974, 'CHI'],
    ['Chet Walker', 'SF', 84, 'M', '25', 1971, 'CHI'],
    ['Tom Boerwinkle', 'C', 79, 'RP', '24', 1971, 'CHI'],
    ['Kyrie Irving', 'PG', 91, 'IMC', '2', 2016, 'CLE'],
    ['Kevin Love', 'PF/C', 86, 'RS', '0', 2016, 'CLE'],
    ['Brad Daugherty', 'C', 87, 'GR', '43', 1992, 'CLE'],
    ['Larry Nance', 'PF', 85, 'BI', '22', 1989, 'CLE'],
    ['Zydrunas Ilgauskas', 'C', 84, 'GR', '11', 2005, 'CLE'],
    ['Austin Carr', 'SG', 83, 'X', '34', 1974, 'CLE'],
    ['Ron Harper', 'SG', 84, 'ID', '4', 1987, 'CLE'],
    ['Hot Rod Williams', 'PF/C', 83, 'B', '18', 1990, 'CLE'],
    ['Craig Ehlo', 'SG', 79, 'S', '25', 1989, 'CLE'],
    ['Tristan Thompson', 'C', 79, 'R', '13', 2016, 'CLE'],
    ['Mark Aguirre', 'SF', 87, 'XG', '24', 1984, 'DAL'],
    ['Rolando Blackman', 'SG', 85, 'MX', '22', 1987, 'DAL'],
    ['Michael Finley', 'SG/SF', 85, 'XS', '4', 2000, 'DAL'],
    ['Steve Nash', 'PG', 88, 'PS', '13', 2002, 'DAL'],
    ['Jason Terry', 'SG', 83, 'SC', '31', 2011, 'DAL'],
    ['Tyson Chandler', 'C', 85, 'BR', '6', 2011, 'DAL'],
    ['Derek Harper', 'PG', 83, 'DP', '12', 1990, 'DAL'],
    ['Luka Dončić', 'PG/SG', 96, 'XPS', '77', 2024, 'DAL'],
    ['Sam Perkins', 'PF', 82, 'S', '44', 1990, 'DAL'],
    ['James Donaldson', 'C', 80, 'R', '40', 1987, 'DAL'],
    ['Shawn Marion', 'SF/PF', 82, 'D', '0', 2011, 'DAL'],
    ['Alex English', 'SF', 89, 'XM', '2', 1983, 'DEN'],
    ['Dan Issel', 'C/PF', 86, 'GX', '44', 1980, 'DEN'],
    ['David Thompson', 'SG', 89, 'IX', '33', 1978, 'DEN'],
    ['Dikembe Mutombo', 'C', 86, 'BR', '55', 1994, 'DEN'],
    ['Fat Lever', 'PG', 85, 'PR', '12', 1987, 'DEN'],
    ['Kiki Vandeweghe', 'SF', 86, 'MX', '55', 1984, 'DEN'],
    ['Chauncey Billups', 'PG', 86, 'PSC', '7', 2009, 'DEN'],
    ['Jamal Murray', 'PG', 88, 'CMS', '27', 2023, 'DEN'],
    ['Antonio McDyess', 'PF', 84, 'RI', '24', 1999, 'DEN'],
    ['Aaron Gordon', 'PF', 83, 'ID', '50', 2023, 'DEN'],
    ['Marcus Camby', 'C', 84, 'BR', '23', 2007, 'DEN'],
    ['Dave Bing', 'SG/PG', 88, 'XP', '21', 1971, 'DET'],
    ['Bob Lanier', 'C', 89, 'GX', '16', 1974, 'DET'],
    ['Chauncey Billups', 'PG', 87, 'PCS', '1', 2004, 'DET'],
    ['Richard Hamilton', 'SG', 85, 'M', '32', 2006, 'DET'],
    ['Vinnie Johnson', 'SG', 81, 'X', '15', 1989, 'DET'],
    ['Tayshaun Prince', 'SF', 82, 'D', '22', 2004, 'DET'],
    ['Kelly Tripucka', 'SF', 83, 'X', '7', 1983, 'DET'],
    ['Tim Hardaway', 'PG', 87, 'PI', '10', 1992, 'GSW'],
    ['Mitch Richmond', 'SG', 86, 'XS', '23', 1990, 'GSW'],
    ['Andre Iguodala', 'SF', 82, 'DP', '9', 2015, 'GSW'],
    ['Baron Davis', 'PG', 86, 'PI', '5', 2007, 'GSW'],
    ['Paul Arizin', 'SF', 87, 'X', '11', 1957, 'PHW'],
    ['Chris Webber', 'PF', 85, 'RI', '4', 1994, 'GSW'],
    ['Andrew Bogut', 'C', 80, 'BP', '12', 2015, 'GSW'],
    ['Clyde Drexler', 'SG/SF', 89, 'IX', '22', 1995, 'HOU'],
    ['Calvin Murphy', 'PG', 84, 'S', '23', 1978, 'HOU'],
    ['Ralph Sampson', 'C/PF', 88, 'GR', '50', 1985, 'HOU'],
    ['Tracy McGrady', 'SF/SG', 91, 'XMS', '1', 2005, 'HOU'],
    ['Rudy Tomjanovich', 'PF', 85, 'M', '45', 1974, 'HOU'],
    ['Robert Horry', 'PF/SF', 82, 'SD', '25', 1995, 'HOU'],
    ['Chris Paul', 'PG', 90, 'PMD', '3', 2018, 'HOU'],
    ['Otis Thorpe', 'PF', 83, 'R', '33', 1994, 'HOU'],
    ['Kenny Smith', 'PG', 81, 'S', '30', 1994, 'HOU'],
    ['Vernon Maxwell', 'SG', 80, 'S', '11', 1994, 'HOU'],
    ['Rik Smits', 'C', 84, 'G', '45', 1998, 'IND'],
    ['Chuck Person', 'SF', 83, 'S', '45', 1989, 'IND'],
    ['Mark Jackson', 'PG', 82, 'P', '13', 1998, 'IND'],
    ['Danny Granger', 'SF', 86, 'XS', '33', 2009, 'IND'],
    ['Paul George', 'SF', 89, 'DS', '24', 2014, 'IND'],
    ['Detlef Schrempf', 'SF/PF', 84, 'SP', '11', 1992, 'IND'],
    ['Dale Davis', 'PF/C', 80, 'R', '32', 1998, 'IND'],
    ['Roy Hibbert', 'C', 83, 'B', '55', 2013, 'IND'],
    ['Jalen Rose', 'SF/SG', 83, 'X', '5', 2000, 'IND'],
    ['Tyrese Haliburton', 'PG', 90, 'PS', '0', 2025, 'IND'],
    ['David West', 'PF', 83, 'M', '21', 2013, 'IND'],
    ['George Hill', 'PG', 81, 'D', '3', 2014, 'IND'],
    ['Elton Brand', 'PF', 87, 'GR', '42', 2006, 'LAC'],
    ['DeAndre Jordan', 'C', 84, 'RB', '6', 2015, 'LAC'],
    ['Danny Manning', 'PF', 85, 'IG', '25', 1993, 'LAC'],
    ['Kawhi Leonard', 'SF', 93, 'DMC', '2', 2020, 'LAC'],
    ['Paul George', 'SF', 89, 'SD', '13', 2021, 'LAC'],
    ['Lou Williams', 'SG', 82, 'X', '23', 2019, 'LAC'],
    ['Randy Smith', 'SG', 82, 'I', '9', 1978, 'BUF'],
    ['Ron Harper', 'SG', 84, 'ID', '4', 1990, 'LAC'],
    ['Corey Maggette', 'SF', 82, 'I', '50', 2005, 'LAC'],
    ['Jamal Crawford', 'SG', 82, 'XS', '11', 2014, 'LAC'],
    ['Mark Jackson', 'PG', 80, 'P', '13', 1993, 'LAC'],
    ['Sam Cassell', 'PG', 84, 'MC', '19', 2006, 'LAC'],
    ['George Mikan', 'C', 90, 'GR', '99', 1950, 'MNL'],
    ['Gail Goodrich', 'SG', 86, 'X', '25', 1972, 'LAL'],
    ['Byron Scott', 'SG', 83, 'S', '4', 1988, 'LAL'],
    ['Anthony Davis', 'PF/C', 92, 'BRG', '3', 2020, 'LAL'],
    ['Derek Fisher', 'PG', 80, 'SC', '2', 2009, 'LAL'],
    ['Pau Gasol', 'PF/C', 88, 'GP', '16', 2006, 'MEM'],
    ['Marc Gasol', 'C', 87, 'BPG', '33', 2013, 'MEM'],
    ['Zach Randolph', 'PF', 87, 'GR', '50', 2011, 'MEM'],
    ['Mike Conley', 'PG', 86, 'PS', '11', 2017, 'MEM'],
    ['Tony Allen', 'SG', 82, 'D', '9', 2013, 'MEM'],
    ['Shareef Abdur-Rahim', 'PF/SF', 86, 'X', '3', 2000, 'VAN'],
    ['Bryant Reeves', 'C', 78, 'G', '50', 1997, 'VAN'],
    ['Mike Bibby', 'PG', 84, 'PS', '10', 2001, 'VAN'],
    ['Ja Morant', 'PG', 91, 'IX', '12', 2022, 'MEM'],
    ['Rudy Gay', 'SF', 84, 'X', '22', 2010, 'MEM'],
    ['Desmond Bane', 'SG', 84, 'S', '22', 2023, 'MEM'],
    ['Jaren Jackson Jr.', 'PF/C', 86, 'BS', '13', 2023, 'MEM'],
    ['Dillon Brooks', 'SF', 80, 'D', '24', 2022, 'MEM'],
    ['Glen Rice', 'SF', 85, 'S', '41', 1992, 'MIA'],
    ['Jimmy Butler', 'SF/PF', 90, 'DCI', '22', 2020, 'MIA'],
    ['Udonis Haslem', 'PF', 78, 'R', '40', 2006, 'MIA'],
    ['Goran Dragić', 'PG', 83, 'I', '7', 2018, 'MIA'],
    ['Bam Adebayo', 'C/PF', 86, 'BDR', '13', 2023, 'MIA'],
    ['Eddie Jones', 'SG/SF', 84, 'DS', '6', 2001, 'MIA'],
    ['Oscar Robertson', 'PG', 89, 'PR', '1', 1971, 'MIL'],
    ['Marques Johnson', 'SF', 87, 'IX', '8', 1979, 'MIL'],
    ['Bob Dandridge', 'SF', 84, 'M', '10', 1974, 'MIL'],
    ['Terry Cummings', 'PF', 86, 'GX', '34', 1985, 'MIL'],
    ['Glenn Robinson', 'SF', 85, 'X', '13', 1998, 'MIL'],
    ['Michael Redd', 'SG', 86, 'S', '22', 2004, 'MIL'],
    ['Jack Sikma', 'C', 84, 'RM', '43', 1987, 'MIL'],
    ['Khris Middleton', 'SF', 86, 'MSC', '22', 2021, 'MIL'],
    ['Brook Lopez', 'C', 84, 'BS', '11', 2021, 'MIL'],
    ['Jrue Holiday', 'PG', 86, 'DP', '21', 2021, 'MIL'],
    ['Bob Lanier', 'C', 84, 'G', '16', 1983, 'MIL'],
    ['Sam Cassell', 'PG', 86, 'MC', '19', 2004, 'MIN'],
    ['Latrell Sprewell', 'SG', 84, 'X', '8', 2004, 'MIN'],
    ['Karl-Anthony Towns', 'C/PF', 88, 'SRG', '32', 2018, 'MIN'],
    ['Stephon Marbury', 'PG', 84, 'PI', '3', 1998, 'MIN'],
    ['Wally Szczerbiak', 'SF', 82, 'S', '10', 2002, 'MIN'],
    ['Tom Gugliotta', 'PF', 83, 'R', '24', 1997, 'MIN'],
    ['Rudy Gobert', 'C', 86, 'BR', '27', 2024, 'MIN'],
    ['Anthony Edwards', 'SG', 92, 'XIS', '5', 2025, 'MIN'],
    ['Ricky Rubio', 'PG', 80, 'P', '9', 2015, 'MIN'],
    ['Andrew Wiggins', 'SF', 82, 'X', '22', 2017, 'MIN'],
    ['Jimmy Butler', 'SF', 88, 'DX', '23', 2018, 'MIN'],
    ['Anthony Davis', 'PF/C', 94, 'BRG', '23', 2018, 'NOP'],
    ['Jrue Holiday', 'PG/SG', 86, 'DP', '11', 2018, 'NOP'],
    ['Zion Williamson', 'PF', 88, 'IG', '1', 2021, 'NOP'],
    ['David West', 'PF', 85, 'M', '30', 2008, 'NOH'],
    ['Tyson Chandler', 'C', 83, 'RB', '6', 2008, 'NOH'],
    ['Baron Davis', 'PG', 86, 'PI', '1', 2004, 'NOH'],
    ['Jamal Mashburn', 'SF', 85, 'X', '24', 2003, 'NOH'],
    ['Eric Gordon', 'SG', 82, 'S', '10', 2015, 'NOP'],
    ['DeMarcus Cousins', 'C', 88, 'GRP', '0', 2018, 'NOP'],
    ['Brandon Ingram', 'SF', 86, 'MX', '14', 2022, 'NOP'],
    ['Peja Stojaković', 'SF', 82, 'S', '16', 2008, 'NOH'],
    ['Ryan Anderson', 'PF', 81, 'S', '33', 2014, 'NOP'],
    ['Earl Monroe', 'SG', 86, 'XI', '15', 1973, 'NYK'],
    ['Dave DeBusschere', 'PF', 86, 'RD', '22', 1970, 'NYK'],
    ['Bill Bradley', 'SF', 83, 'S', '24', 1972, 'NYK'],
    ['Charles Oakley', 'PF', 83, 'R', '34', 1994, 'NYK'],
    ['John Starks', 'SG', 82, 'S', '3', 1994, 'NYK'],
    ['Allan Houston', 'SG', 84, 'M', '20', 2000, 'NYK'],
    ['Amar\'e Stoudemire', 'PF/C', 87, 'IG', '1', 2011, 'NYK'],
    ['Jalen Brunson', 'PG', 91, 'MCX', '11', 2025, 'NYK'],
    ['Mark Jackson', 'PG', 83, 'P', '13', 1988, 'NYK'],
    ['Latrell Sprewell', 'SG/SF', 84, 'XD', '8', 1999, 'NYK'],
    ['Richie Guerin', 'PG', 84, 'X', '9', 1962, 'NYK'],
    ['Spencer Haywood', 'PF', 88, 'XR', '24', 1973, 'SEA'],
    ['Jack Sikma', 'C', 86, 'RM', '43', 1982, 'SEA'],
    ['Dennis Johnson', 'SG', 86, 'D', '24', 1979, 'SEA'],
    ['Gus Williams', 'PG', 87, 'IX', '1', 1980, 'SEA'],
    ['Ray Allen', 'SG', 89, 'SX', '20', 2006, 'SEA'],
    ['Rashard Lewis', 'SF', 84, 'S', '7', 2005, 'SEA'],
    ['Steven Adams', 'C', 83, 'R', '12', 2018, 'OKC'],
    ['Serge Ibaka', 'PF/C', 84, 'B', '9', 2012, 'OKC'],
    ['Chet Holmgren', 'C/PF', 88, 'BSR', '7', 2025, 'OKC'],
    ['Jalen Williams', 'SF/SG', 88, 'XDM', '8', 2025, 'OKC'],
    ['Nick Anderson', 'SG', 82, 'S', '25', 1995, 'ORL'],
    ['Horace Grant', 'PF', 83, 'R', '54', 1995, 'ORL'],
    ['Hedo Türkoğlu', 'SF', 82, 'P', '15', 2009, 'ORL'],
    ['Rashard Lewis', 'PF/SF', 84, 'S', '9', 2009, 'ORL'],
    ['Jameer Nelson', 'PG', 82, 'S', '14', 2009, 'ORL'],
    ['Dennis Scott', 'SF', 81, 'S', '3', 1996, 'ORL'],
    ['Nikola Vučević', 'C', 85, 'RS', '9', 2021, 'ORL'],
    ['Paolo Banchero', 'PF', 88, 'XIR', '5', 2025, 'ORL'],
    ['Franz Wagner', 'SF', 87, 'IX', '22', 2025, 'ORL'],
    ['Grant Hill', 'SF', 80, 'P', '33', 2005, 'ORL'],
    ['Hal Greer', 'SG', 87, 'M', '15', 1968, 'PHI'],
    ['Billy Cunningham', 'SF', 88, 'XR', '32', 1970, 'PHI'],
    ['Maurice Cheeks', 'PG', 84, 'PD', '10', 1983, 'PHI'],
    ['Bobby Jones', 'PF', 83, 'D', '24', 1983, 'PHI'],
    ['Dikembe Mutombo', 'C', 86, 'BR', '55', 2001, 'PHI'],
    ['Andre Iguodala', 'SF', 84, 'DP', '9', 2008, 'PHI'],
    ['Ben Simmons', 'PG', 85, 'PDR', '25', 2019, 'PHI'],
    ['Tyrese Maxey', 'PG/SG', 88, 'XIS', '0', 2025, 'PHI'],
    ['Dolph Schayes', 'PF', 88, 'RX', '4', 1958, 'SYR'],
    ['Walter Davis', 'SG', 86, 'MX', '6', 1978, 'PHX'],
    ['Paul Westphal', 'SG', 87, 'XI', '44', 1977, 'PHX'],
    ['Alvan Adams', 'C', 84, 'P', '33', 1976, 'PHX'],
    ['Tom Chambers', 'PF', 86, 'X', '24', 1990, 'PHX'],
    ['Dan Majerle', 'SG/SF', 83, 'SD', '9', 1993, 'PHX'],
    ['Connie Hawkins', 'SF/PF', 86, 'I', '42', 1970, 'PHX'],
    ['Jason Kidd', 'PG', 89, 'PRD', '32', 1999, 'PHX'],
    ['Devin Booker', 'SG', 91, 'MXP', '1', 2023, 'PHX'],
    ['Larry Nance', 'PF', 84, 'BI', '22', 1987, 'PHX'],
    ['Damian Lillard', 'PG', 93, 'SCX', '0', 2021, 'POR'],
    ['Terry Porter', 'PG', 85, 'PS', '30', 1991, 'POR'],
    ['Jerome Kersey', 'SF', 83, 'I', '25', 1988, 'POR'],
    ['Buck Williams', 'PF', 83, 'RD', '52', 1991, 'POR'],
    ['Rasheed Wallace', 'PF/C', 86, 'DS', '30', 2000, 'POR'],
    ['LaMarcus Aldridge', 'PF', 88, 'MG', '12', 2015, 'POR'],
    ['Brandon Roy', 'SG', 87, 'MC', '7', 2009, 'POR'],
    ['Maurice Lucas', 'PF', 85, 'RG', '20', 1977, 'POR'],
    ['Kevin Duckworth', 'C', 80, 'G', '00', 1989, 'POR'],
    ['CJ McCollum', 'SG', 85, 'MS', '3', 2019, 'POR'],
    ['Jusuf Nurkić', 'C', 80, 'R', '27', 2019, 'POR'],
    ['Jerry Lucas', 'PF/C', 88, 'RG', '16', 1965, 'CIN'],
    ['Nate Archibald', 'PG', 90, 'XP', '1', 1973, 'KCK'],
    ['Mitch Richmond', 'SG', 88, 'XS', '2', 1997, 'SAC'],
    ['Mike Bibby', 'PG', 85, 'PC', '10', 2002, 'SAC'],
    ['Jack Twyman', 'SF', 86, 'X', '27', 1960, 'CIN'],
    ['DeMarcus Cousins', 'C', 89, 'GRX', '15', 2016, 'SAC'],
    ['Brad Miller', 'C', 82, 'P', '52', 2004, 'SAC'],
    ['De\'Aaron Fox', 'PG', 88, 'IC', '5', 2023, 'SAC'],
    ['Domantas Sabonis', 'C/PF', 88, 'RPG', '10', 2023, 'SAC'],
    ['Otis Birdsong', 'SG', 83, 'X', '11', 1981, 'KCK'],
    ['Doug Christie', 'SG', 81, 'D', '13', 2002, 'SAC'],
    ['Sean Elliott', 'SF', 83, 'S', '32', 1996, 'SAS'],
    ['Avery Johnson', 'PG', 81, 'P', '6', 1999, 'SAS'],
    ['Bruce Bowen', 'SF', 81, 'D', '12', 2005, 'SAS'],
    ['Victor Wembanyama', 'C/PF', 93, 'BRS', '1', 2025, 'SAS'],
    ['Alvin Robertson', 'SG', 84, 'D', '21', 1986, 'SAS'],
    ['LaMarcus Aldridge', 'PF', 85, 'MG', '12', 2018, 'SAS'],
    ['Chris Bosh', 'PF/C', 88, 'MR', '4', 2007, 'TOR'],
    ['Kyle Lowry', 'PG', 87, 'PDC', '7', 2019, 'TOR'],
    ['DeMar DeRozan', 'SG/SF', 88, 'MX', '10', 2018, 'TOR'],
    ['Pascal Siakam', 'PF', 85, 'I', '43', 2019, 'TOR'],
    ['Damon Stoudamire', 'PG', 83, 'P', '20', 1997, 'TOR'],
    ['Tracy McGrady', 'SF', 84, 'I', '1', 2000, 'TOR'],
    ['Antonio Davis', 'C/PF', 80, 'R', '33', 2001, 'TOR'],
    ['Jonas Valančiūnas', 'C', 80, 'R', '17', 2018, 'TOR'],
    ['Marc Gasol', 'C', 82, 'P', '33', 2019, 'TOR'],
    ['Fred VanVleet', 'PG', 84, 'SPD', '23', 2021, 'TOR'],
    ['Scottie Barnes', 'SF/PF', 86, 'PDR', '4', 2025, 'TOR'],
    ['Darrell Griffith', 'SG', 83, 'S', '35', 1984, 'UTA'],
    ['Mark Eaton', 'C', 84, 'BR', '53', 1985, 'UTA'],
    ['Jeff Hornacek', 'SG', 83, 'S', '14', 1998, 'UTA'],
    ['Andrei Kirilenko', 'SF/PF', 85, 'BD', '47', 2004, 'UTA'],
    ['Deron Williams', 'PG', 88, 'PS', '8', 2010, 'UTA'],
    ['Carlos Boozer', 'PF', 85, 'RG', '5', 2008, 'UTA'],
    ['Donovan Mitchell', 'SG', 88, 'XSC', '45', 2021, 'UTA'],
    ['Rudy Gobert', 'C', 88, 'BR', '27', 2021, 'UTA'],
    ['Gordon Hayward', 'SF', 85, 'MS', '20', 2017, 'UTA'],
    ['Mehmet Okur', 'C', 81, 'S', '13', 2007, 'UTA'],
    ['Truck Robinson', 'PF', 83, 'R', '21', 1978, 'NOJ'],
    ['Earl Monroe', 'SG', 87, 'XI', '10', 1969, 'BAL'],
    ['Gus Johnson', 'PF', 85, 'R', '25', 1970, 'BAL'],
    ['Chris Webber', 'PF', 87, 'RPG', '4', 1997, 'WSB'],
    ['Juwan Howard', 'PF', 84, 'M', '5', 1996, 'WSB'],
    ['Antawn Jamison', 'PF', 84, 'X', '4', 2007, 'WAS'],
    ['Caron Butler', 'SF', 84, 'I', '3', 2008, 'WAS'],
    ['John Wall', 'PG', 88, 'PI', '2', 2017, 'WAS'],
    ['Bradley Beal', 'SG', 89, 'XM', '3', 2021, 'WAS'],
    ['Bernard King', 'SF', 86, 'X', '30', 1991, 'WSB'],
    ['Jeff Ruland', 'C', 82, 'R', '43', 1984, 'WSB'],
    ['Moses Malone', 'C', 85, 'R', '4', 1987, 'WSB'],
    ['Rod Strickland', 'PG', 84, 'P', '1', 1998, 'WSB'],
    ['Jayson Tatum', 'SF/PF', 93, 'XSR', '0', 2024, 'BOS'],
    ['Jaylen Brown', 'SG/SF', 89, 'IXD', '7', 2024, 'BOS'],
    ['Rajon Rondo', 'PG', 86, 'PD', '9', 2012, 'BOS'],
    ['Tom Heinsohn', 'PF', 85, 'X', '15', 1960, 'BOS'],
    ['Jo Jo White', 'PG', 85, 'M', '10', 1974, 'BOS'],
    // versões novas: MVPs das Finais, MVPs que faltavam e mais temporadas das grandes lendas
    ['Jerry West', 'PG/SG', 93, 'CMP', '44', 1969, 'LAL'],
    ['Willis Reed', 'C', 87, 'RGC', '19', 1973, 'NYK'],
    ['Jo Jo White', 'PG', 86, 'MCP', '10', 1976, 'BOS'],
    ['Bill Walton', 'C', 90, 'PBR', '32', 1977, 'POR'],
    ['Wes Unseld', 'C', 85, 'RP', '41', 1978, 'WSB'],
    ['Cedric Maxwell', 'SF/PF', 82, 'GI', '31', 1981, 'BOS'],
    ['Magic Johnson', 'PG/SF', 93, 'PRI', '32', 1982, 'LAL'],
    ['Kareem Abdul-Jabbar', 'C', 92, 'GXB', '33', 1985, 'LAL'],
    ['Isiah Thomas', 'PG', 91, 'PCI', '11', 1990, 'DET'],
    ['Michael Jordan', 'SG/SF', 98, 'XDC', '23', 1992, 'CHI'],
    ['Michael Jordan', 'SG/SF', 97, 'XCM', '23', 1993, 'CHI'],
    ['Hakeem Olajuwon', 'C', 95, 'GBD', '34', 1995, 'HOU'],
    ['Michael Jordan', 'SG/SF', 97, 'MXC', '23', 1997, 'CHI'],
    ['Tim Duncan', 'PF/C', 93, 'GBR', '21', 1999, 'SAS'],
    ['Shaquille O\'Neal', 'C', 96, 'GRX', '34', 2001, 'LAL'],
    ['Shaquille O\'Neal', 'C', 95, 'GRB', '34', 2002, 'LAL'],
    ['Tim Duncan', 'PF/C', 94, 'GBR', '21', 2005, 'SAS'],
    ['Kobe Bryant', 'SG/SF', 95, 'XMC', '8', 2009, 'LAL'],
    ['LeBron James', 'SF/PF/PG', 98, 'IPX', '6', 2012, 'MIA'],
    ['Kevin Durant', 'SF/PF', 95, 'MSX', '35', 2018, 'GSW'],
    ['Giannis Antetokounmpo', 'PF/C', 96, 'IRB', '34', 2021, 'MIL'],
    ['Stephen Curry', 'PG', 95, 'SXC', '30', 2022, 'GSW'],
    ['Nikola Jokić', 'C', 97, 'PGR', '15', 2023, 'DEN'],
    ['Bob Pettit', 'PF', 90, 'RX', '9', 1956, 'STL'],
    ['Bill Russell', 'C', 93, 'BRD', '6', 1958, 'BOS'],
    ['Wilt Chamberlain', 'C', 95, 'XRG', '13', 1960, 'PHW'],
    ['Bill Russell', 'C', 94, 'BRP', '6', 1961, 'BOS'],
    ['Bill Russell', 'C', 94, 'BRD', '6', 1963, 'BOS'],
    ['Wilt Chamberlain', 'C', 96, 'RXB', '13', 1966, 'PHI'],
    ['Wilt Chamberlain', 'C', 95, 'RPB', '13', 1968, 'PHI'],
    ['Kareem Abdul-Jabbar', 'C', 97, 'GXB', '33', 1972, 'MIL'],
    ['Kareem Abdul-Jabbar', 'C', 95, 'GBR', '33', 1974, 'MIL'],
    ['Kareem Abdul-Jabbar', 'C', 96, 'GBR', '33', 1976, 'LAL'],
    ['Kareem Abdul-Jabbar', 'C', 95, 'GXB', '33', 1980, 'LAL'],
    ['Moses Malone', 'C', 92, 'RG', '24', 1982, 'HOU'],
    ['Larry Bird', 'SF/PF', 97, 'SPX', '33', 1985, 'BOS'],
    ['Magic Johnson', 'PG/SF', 96, 'PRS', '32', 1989, 'LAL'],
    ['Tim Duncan', 'PF/C', 96, 'GBR', '21', 2002, 'SAS'],
    ['LeBron James', 'SF/PF/PG', 97, 'IPX', '23', 2010, 'CLE'],
    ['Nikola Jokić', 'C', 97, 'PGR', '15', 2024, 'DEN'],
    ['Kobe Bryant', 'SG/SF', 94, 'XMI', '8', 2003, 'LAL'],
    ['Dwyane Wade', 'SG', 91, 'IDX', '3', 2011, 'MIA'],
    ['Kevin Garnett', 'PF/C', 93, 'BRM', '21', 2003, 'MIN'],
    ['Dirk Nowitzki', 'PF', 93, 'MSX', '41', 2006, 'DAL'],
    ['Hakeem Olajuwon', 'C', 93, 'BGR', '34', 1990, 'HOU'],
    ['Patrick Ewing', 'C', 91, 'GBR', '33', 1994, 'NYK'],
    ['Scottie Pippen', 'SF/SG', 91, 'DPI', '33', 1996, 'CHI'],
    ['Karl Malone', 'PF', 91, 'GXR', '32', 1992, 'UTA'],
    ['John Stockton', 'PG', 90, 'PDS', '12', 1995, 'UTA'],
    ['Gary Payton', 'PG', 90, 'DPX', '20', 2000, 'SEA'],
    ['Charles Barkley', 'PF', 92, 'RIG', '34', 1991, 'PHI'],
    ['Allen Iverson', 'SG/PG', 90, 'XID', '3', 1999, 'PHI'],
    ['Tracy McGrady', 'SF/SG', 91, 'XMI', '1', 2002, 'ORL'],
    ['Vince Carter', 'SG/SF', 91, 'IXS', '15', 2000, 'TOR'],
    ['Chris Paul', 'PG', 92, 'PDM', '3', 2009, 'NOH'],
    ['Russell Westbrook', 'PG', 91, 'IXP', '0', 2016, 'OKC'],
    ['James Harden', 'SG/PG', 94, 'XSP', '13', 2019, 'HOU'],
    ['Kawhi Leonard', 'SF', 92, 'DMS', '2', 2017, 'SAS'],
    ['Julius Erving', 'SF', 90, 'IX', '6', 1983, 'PHI'],
    ['Isiah Thomas', 'PG', 90, 'PIX', '11', 1984, 'DET'],
    ['Elgin Baylor', 'SF', 92, 'XRI', '22', 1961, 'LAL'],
    ['Jerry West', 'PG/SG', 93, 'XMC', '44', 1966, 'LAL'],
    ['Stephen Curry', 'PG', 94, 'SXP', '30', 2017, 'GSW'],
    ['Giannis Antetokounmpo', 'PF/C', 95, 'IRX', '34', 2023, 'MIL'],
    ['Luka Dončić', 'PG/SG', 94, 'XPS', '77', 2022, 'DAL'],
    ['Damian Lillard', 'PG', 92, 'SCX', '0', 2020, 'POR'],
    ['Joel Embiid', 'C', 93, 'GXR', '21', 2022, 'PHI'],
    ['Penny Hardaway', 'PG/SG', 89, 'PIX', '1', 1995, 'ORL'],
    ['Reggie Miller', 'SG', 88, 'SCM', '31', 1995, 'IND'],
    ['Ray Allen', 'SG', 86, 'SC', '20', 2009, 'BOS'],
    ['Pau Gasol', 'PF/C', 88, 'GPR', '16', 2009, 'LAL'],
    ['Tony Parker', 'PG', 88, 'IPM', '9', 2013, 'SAS'],
    ['Manu Ginóbili', 'SG', 87, 'ICS', '20', 2008, 'SAS'],
    ['Klay Thompson', 'SG', 88, 'SDM', '11', 2019, 'GSW'],
    ['Draymond Green', 'PF/C', 87, 'DPB', '23', 2017, 'GSW'],
    ['Steve Nash', 'PG', 89, 'PSM', '13', 2010, 'PHX'],
    ['Yao Ming', 'C', 89, 'GRB', '11', 2007, 'HOU'],
    ['Paul Pierce', 'SF', 89, 'XSM', '34', 2002, 'BOS'],
    ['Grant Hill', 'SF', 90, 'PIX', '33', 2000, 'DET'],
    ['Scottie Pippen', 'SF/SG', 90, 'DPI', '33', 1992, 'CHI'],
    ['Kevin McHale', 'PF', 89, 'GBR', '32', 1986, 'BOS'],
    ['Dennis Johnson', 'SG/PG', 86, 'DP', '3', 1984, 'BOS'],
  ];

  // MVPs da temporada regular (ano = fim da temporada). Quem aparece no ano em que foi MVP ganha bônus.
  const MVPS = {
    1956: 'Bob Pettit', 1957: 'Bob Cousy', 1958: 'Bill Russell', 1959: 'Bob Pettit', 1960: 'Wilt Chamberlain',
    1961: 'Bill Russell', 1962: 'Bill Russell', 1963: 'Bill Russell', 1964: 'Oscar Robertson', 1965: 'Bill Russell',
    1966: 'Wilt Chamberlain', 1967: 'Wilt Chamberlain', 1968: 'Wilt Chamberlain', 1969: 'Wes Unseld', 1970: 'Willis Reed',
    1971: 'Kareem Abdul-Jabbar', 1972: 'Kareem Abdul-Jabbar', 1973: 'Dave Cowens', 1974: 'Kareem Abdul-Jabbar',
    1975: 'Bob McAdoo', 1976: 'Kareem Abdul-Jabbar', 1977: 'Kareem Abdul-Jabbar', 1978: 'Bill Walton', 1979: 'Moses Malone',
    1980: 'Kareem Abdul-Jabbar', 1981: 'Julius Erving', 1982: 'Moses Malone', 1983: 'Moses Malone', 1984: 'Larry Bird',
    1985: 'Larry Bird', 1986: 'Larry Bird', 1987: 'Magic Johnson', 1988: 'Michael Jordan', 1989: 'Magic Johnson',
    1990: 'Magic Johnson', 1991: 'Michael Jordan', 1992: 'Michael Jordan', 1993: 'Charles Barkley', 1994: 'Hakeem Olajuwon',
    1995: 'David Robinson', 1996: 'Michael Jordan', 1997: 'Karl Malone', 1998: 'Michael Jordan', 1999: 'Karl Malone',
    2000: 'Shaquille O\'Neal', 2001: 'Allen Iverson', 2002: 'Tim Duncan', 2003: 'Tim Duncan', 2004: 'Kevin Garnett',
    2005: 'Steve Nash', 2006: 'Steve Nash', 2007: 'Dirk Nowitzki', 2008: 'Kobe Bryant', 2009: 'LeBron James',
    2010: 'LeBron James', 2011: 'Derrick Rose', 2012: 'LeBron James', 2013: 'LeBron James', 2014: 'Kevin Durant',
    2015: 'Stephen Curry', 2016: 'Stephen Curry', 2017: 'Russell Westbrook', 2018: 'James Harden', 2019: 'Giannis Antetokounmpo',
    2020: 'Giannis Antetokounmpo', 2021: 'Nikola Jokić', 2022: 'Nikola Jokić', 2023: 'Joel Embiid', 2024: 'Nikola Jokić',
    2025: 'Shai Gilgeous-Alexander', 2026: 'Shai Gilgeous-Alexander',
  };
  // MVPs das Finais (ano = fim da temporada). A versão do ano em que foi MVP das Finais ganha um bônus
  // um pouco menor que o do MVP da temporada.
  const FMVPS = {
    1969: 'Jerry West', 1970: 'Willis Reed', 1971: 'Kareem Abdul-Jabbar', 1972: 'Wilt Chamberlain', 1973: 'Willis Reed',
    1974: 'John Havlicek', 1975: 'Rick Barry', 1976: 'Jo Jo White', 1977: 'Bill Walton', 1978: 'Wes Unseld',
    1979: 'Dennis Johnson', 1980: 'Magic Johnson', 1981: 'Cedric Maxwell', 1982: 'Magic Johnson', 1983: 'Moses Malone',
    1984: 'Larry Bird', 1985: 'Kareem Abdul-Jabbar', 1986: 'Larry Bird', 1987: 'Magic Johnson', 1988: 'James Worthy',
    1989: 'Joe Dumars', 1990: 'Isiah Thomas', 1991: 'Michael Jordan', 1992: 'Michael Jordan', 1993: 'Michael Jordan',
    1994: 'Hakeem Olajuwon', 1995: 'Hakeem Olajuwon', 1996: 'Michael Jordan', 1997: 'Michael Jordan', 1998: 'Michael Jordan',
    1999: 'Tim Duncan', 2000: 'Shaquille O\'Neal', 2001: 'Shaquille O\'Neal', 2002: 'Shaquille O\'Neal', 2003: 'Tim Duncan',
    2004: 'Chauncey Billups', 2005: 'Tim Duncan', 2006: 'Dwyane Wade', 2007: 'Tony Parker', 2008: 'Paul Pierce',
    2009: 'Kobe Bryant', 2010: 'Kobe Bryant', 2011: 'Dirk Nowitzki', 2012: 'LeBron James', 2013: 'LeBron James',
    2014: 'Kawhi Leonard', 2015: 'Andre Iguodala', 2016: 'LeBron James', 2017: 'Kevin Durant', 2018: 'Kevin Durant',
    2019: 'Kawhi Leonard', 2020: 'LeBron James', 2021: 'Giannis Antetokounmpo', 2022: 'Stephen Curry', 2023: 'Nikola Jokić',
    2024: 'Jaylen Brown', 2025: 'Shai Gilgeous-Alexander', 2026: 'Jalen Brunson',
  };
  const CURRENT_SEASON = 2026; // temporada dos jogadores "NBA Atual"

  // franquia atual de cada time antigo (para o modo "Lendas da franquia")
  const FRANCHISE_OF = { SEA: 'OKC', NJN: 'BKN', CIN: 'SAC', KCK: 'SAC', STL: 'ATL', BUF: 'LAC', NOJ: 'UTA', BAL: 'WAS', WSB: 'WAS', SFW: 'GSW', PHW: 'GSW', NOH: 'NOP', VAN: 'MEM', SYR: 'PHI', MNL: 'LAL' };
  const franchiseOf = (teamCode) => FRANCHISE_OF[teamCode] || teamCode;
  // conferências (para a liga de 30 times do 82-0)
  const EAST = ['ATL', 'BOS', 'BKN', 'CHA', 'CHI', 'CLE', 'DET', 'IND', 'MIA', 'MIL', 'NYK', 'ORL', 'PHI', 'TOR', 'WAS'];
  const confOf = (teamId) => (EAST.includes(teamId) ? 'E' : 'W');
  const CONF_LABEL = { E: 'Leste', W: 'Oeste' };
  // jogadores dos times de lendas do 82-0 usam ids próprios ("c:BOS:l45") para não misturar estatísticas
  const baseId = (id) => (typeof id === 'string' && id.startsWith('c:') ? id.slice(id.lastIndexOf(':') + 1) : id);

  const POOL_INFO = {
    atual: { label: 'NBA Atual', desc: 'Astros e titulares da NBA de hoje' },
    lendas: { label: 'Lendas da NBA', desc: 'Os maiores de todos os tempos, no auge' },
    mix: { label: 'Atual + Lendas', desc: 'Jordan e Wemby no mesmo leilão' },
    franquia: { label: 'Lendas da franquia', desc: 'Cada técnico só recebe as lendas do time que escolheu' },
  };

  const PLAYERS = {};
  function add(list, prefix, era) {
    const ids = [];
    list.forEach((row, i) => {
      const id = prefix + i;
      const pos = row[1].split('/');
      const base = row[0];
      const year = row[5] || (era === 'atual' ? CURRENT_SEASON : null);
      const name = era === 'lenda' && year ? `${base} '${String(year).slice(2)}` : base;
      PLAYERS[id] = {
        id, name, base, pos: pos[0], positions: pos, ovr: row[2], tags: row[3] || '',
        num: row[4] || '', year, team: row[6] || null, era, mvp: !!year && MVPS[year] === base, fmvp: !!year && FMVPS[year] === base,
      };
      ids.push(id);
    });
    return ids;
  }
  const POOLS = {
    atual: add(ATUAL, 'a', 'atual'),
    lendas: add(LENDAS, 'l', 'lenda'),
  };
  POOLS.mix = POOLS.atual.concat(POOLS.lendas);
  POOLS.franquia = POOLS.lendas;

  // identidade do jogador (todas as versões de uma lenda e a versão atual contam como o mesmo jogador)
  const identity = (p) => (p.base || p.name).replace(/ '\d\d$/, '');


  // ---------- ARENAS ----------
  // Sorteadas no início do jogo (uma por técnico, sem repetir e sem troca). Valem em todos os jogos do time.
  // Todas dão bônus; as lendárias dão bônus maiores. Nenhuma tem ônus.
  // tipo → efeito na simulação:
  //   pontuacao: acerto em todos os arremessos   tres: acerto nas bolas de 3     garrafao: acerto perto da cesta
  //   meia: acerto na meia distância             showtime: contra-ataques e bônus extra no esquema Showtime
  //   defesa: adversário acerta menos            tocos: adversário acerta menos perto da cesta e leva mais tocos
  //   roubos: adversário erra mais passes        rebote: mais rebotes ofensivos e defensivos
  //   decisivo: acerto no 4º quarto e prorrogação            segundo: acerto no 2º tempo (adversário cansado)
  //   passe: menos erros e mais assistências     ritmo: bônus em ritmo acelerado
  //   casa: bônus forte nos jogos em casa
  const ARENAS = [
    { id: 'chicago-stadium', name: 'Chicago Stadium', team: 'CHI', era: 'Bulls de Jordan · anos 90', tier: 'S', type: 'pontuacao', v: 0.0244 },
    { id: 'forum', name: 'The Forum', team: 'LAL', era: 'Lakers do Showtime · anos 80', tier: 'S', type: 'showtime', v: 0.015 },
    { id: 'boston-garden', name: 'Boston Garden', team: 'BOS', era: 'Celtics de Bird · anos 80', tier: 'S', type: 'decisivo', v: 0.094 },
    { id: 'oracle', name: 'Oracle Arena', team: 'GSW', era: 'Warriors de Curry · 2015-19', tier: 'S', type: 'tres', v: 0.0506 },
    { id: 'staples', name: 'Staples Center', team: 'LAL', era: 'Lakers de Shaq e Kobe · 2000-02', tier: 'A', type: 'garrafao', v: 0.039 },
    { id: 'palace', name: 'The Palace of Auburn Hills', team: 'DET', era: 'Pistons "Bad Boys" · 1989-90', tier: 'A', type: 'defesa', v: 0.017 },
    { id: 'att-center', name: 'AT&T Center', team: 'SAS', era: 'Spurs de Duncan · 2003-14', tier: 'A', type: 'passe', v: 0.0157 },
    { id: 'summit', name: 'The Summit', team: 'HOU', era: 'Rockets de Hakeem · 1994-95', tier: 'A', type: 'tocos', v: 0.0348 },
    { id: 'aa-arena', name: 'American Airlines Arena', team: 'MIA', era: 'Heat do Big 3 · 2012-13', tier: 'A', type: 'segundo', v: 0.0316 },
    { id: 'msg', name: 'Madison Square Garden', team: 'NYK', era: 'Knicks · a Meca do basquete', tier: 'A', type: 'casa', v: 0.0187 },
    { id: 'delta-center', name: 'Delta Center', team: 'UTA', era: 'Jazz de Stockton e Malone · 1997-98', tier: 'B', type: 'garrafao', v: 0.031 },
    { id: 'america-west', name: 'America West Arena', team: 'PHX', era: 'Suns dos "7 segundos" · 2005-07', tier: 'B', type: 'ritmo', v: 0.0121 },
    { id: 'ball-arena', name: 'Ball Arena', team: 'DEN', era: 'Nuggets de Jokić · altitude de Denver', tier: 'B', type: 'segundo', v: 0.0264 },
    { id: 'aa-center', name: 'American Airlines Center', team: 'DAL', era: 'Mavericks de Dirk · 2011', tier: 'B', type: 'meia', v: 0.0345 },
    { id: 'paycom', name: 'Paycom Center', team: 'OKC', era: 'Thunder campeão · 2025', tier: 'B', type: 'roubos', v: 0.0199 },
    { id: 'scotiabank', name: 'Scotiabank Arena', team: 'TOR', era: 'Raptors campeões · 2019', tier: 'B', type: 'defesa', v: 0.0114 },
    { id: 'quicken', name: 'Quicken Loans Arena', team: 'CLE', era: 'Cavaliers de LeBron · 2016', tier: 'B', type: 'decisivo', v: 0.051 },
    { id: 'spectrum', name: 'The Spectrum', team: 'PHI', era: '76ers de Dr. J e Moses · 1983', tier: 'B', type: 'rebote', v: 0.0195 },
    { id: 'keyarena', name: 'KeyArena', team: 'SEA', era: 'Sonics de Payton e Kemp · 1996', tier: 'B', type: 'roubos', v: 0.0185 },
    { id: 'arco', name: 'ARCO Arena', team: 'SAC', era: 'Kings de Webber · 2002', tier: 'B', type: 'casa', v: 0.0094 },
    { id: 'fiserv', name: 'Fiserv Forum', team: 'MIL', era: 'Bucks de Giannis · 2021', tier: 'C', type: 'garrafao', v: 0.016 },
    { id: 'gainbridge', name: 'Gainbridge Fieldhouse', team: 'IND', era: 'Pacers de Reggie Miller', tier: 'C', type: 'tres', v: 0.0227 },
    { id: 'target-center', name: 'Target Center', team: 'MIN', era: 'Timberwolves de Garnett · 2004', tier: 'C', type: 'rebote', v: 0.0127 },
    { id: 'fedexforum', name: 'FedExForum', team: 'MEM', era: 'Grizzlies "Grit and Grind"', tier: 'C', type: 'defesa', v: 0.0089 },
    { id: 'memorial-coliseum', name: 'Memorial Coliseum', team: 'POR', era: 'Blazers de Walton · 1977', tier: 'C', type: 'passe', v: 0.0085 },
    { id: 'amway', name: 'Amway Arena', team: 'ORL', era: 'Magic de Shaq e Penny · 1995', tier: 'C', type: 'ritmo', v: 0.0049 },
    { id: 'capital-centre', name: 'Capital Centre', team: 'WSB', era: 'Bullets campeões · 1978', tier: 'C', type: 'tocos', v: 0.016 },
    { id: 'omni', name: 'The Omni', team: 'ATL', era: 'Hawks de Dominique · anos 80', tier: 'C', type: 'meia', v: 0.02 },
    { id: 'charlotte-coliseum', name: 'Charlotte Coliseum', team: 'CHA', era: 'Hornets de Larry Johnson · 1993', tier: 'C', type: 'casa', v: 0.006 },
    { id: 'barclays', name: 'Barclays Center', team: 'BKN', era: 'Nets de KD e Kyrie · 2021', tier: 'C', type: 'pontuacao', v: 0.0079 },
    { id: 'smoothie-king', name: 'Smoothie King Center', team: 'NOP', era: 'Pelicans de Anthony Davis', tier: 'C', type: 'segundo', v: 0.014 },
    { id: 'intuit-dome', name: 'Intuit Dome', team: 'LAC', era: 'Clippers · 2025', tier: 'C', type: 'decisivo', v: 0.025 },
  ];
  const ARENA_TIERS = { S: 'Lendária', A: 'Histórica', B: 'Tradicional', C: 'Comum' };
  function arenaText(a) {
    const pct = (x) => '+' + (Math.round(x * 1000) / 10).toString().replace('.', ',') + '%';
    switch (a.type) {
      case 'pontuacao': return `${pct(a.v)} de acerto em todos os arremessos`;
      case 'tres': return `${pct(a.v)} de acerto nas bolas de 3`;
      case 'garrafao': return `${pct(a.v)} de acerto perto da cesta`;
      case 'meia': return `${pct(a.v)} de acerto na meia distância e ${pct(a.v / 3)} nos outros arremessos`;
      case 'showtime': return `${pct(a.v)} de contra-ataques, e ${pct(a.v)} em todos os arremessos jogando no esquema Showtime`;
      case 'defesa': return `adversário com ${pct(a.v).replace('+', '−')} de acerto em tudo`;
      case 'tocos': return `adversário com ${pct(a.v).replace('+', '−')} de acerto perto da cesta e mais tocos`;
      case 'roubos': return `${pct(a.v)} de erros forçados no adversário`;
      case 'rebote': return `${pct(a.v)} de rebotes ofensivos e defensivos`;
      case 'decisivo': return `${pct(a.v)} de acerto no 4º quarto e na prorrogação`;
      case 'segundo': return `${pct(a.v)} de acerto no 2º tempo (o adversário cansa)`;
      case 'passe': return `${pct(a.v)} menos erros de passe e ${pct(a.v / 2)} de acerto`;
      case 'ritmo': return `${pct(a.v)} de acerto em ritmo acelerado (${pct(a.v * 0.4)} nos outros ritmos)`;
      case 'casa': return `${pct(a.v * 2)} de acerto nos jogos em casa`;
      default: return '';
    }
  }
  const arenaTeamColors = (a) => TEAMS.find((t) => t.id === a.team) || OLD_TEAMS[a.team] || { c1: '#333', c2: '#999' };

  // ---------- CARTAS ----------
  // Cada técnico escolhe uma depois do leilão. Em cada jogo ela pode ser ativada uma vez;
  // se não for usada, ativa sozinha com 3 minutos para o fim do 4º quarto.
  const CARDS = {
    isotonico: {
      label: 'Isotônico', icon: '🧃', color: 'verde', dur: 240,
      desc: 'O time corre mais. Atacantes (arremesso, infiltração, garrafão, pontuação, passe) ganham +4% de acerto; cada defensor, protetor de aro ou reboteiro em quadra tira 1,2% do acerto do adversário (até 3,5%). Mais contra-ataques.',
    },
    escudo: {
      label: 'Escudo', icon: '🛡️', color: 'cinza', dur: 240,
      desc: 'Defesa reforçada: adversário com −3,5% de acerto em todos os arremessos e +2% de erros forçados.',
    },
    mira: {
      label: 'Mira', icon: '🎯', color: 'vermelha', dur: 180,
      desc: 'Arremessadores natos (Bola de 3 e Meia distância) ganham +6% nos arremessos de 3 e de meia distância, arriscam chutes mais difíceis, e +3% nos outros arremessos.',
    },
  };
  const CARD_AUTO = 180; // segundos finais do 4º quarto em que a carta ativa sozinha

  // ---------- características ----------
  const TRAITS = {
    S: { label: 'Bola de 3', icon: '🎯' },
    M: { label: 'Meia distância', icon: '🌀' },
    I: { label: 'Infiltrador', icon: '⚡' },
    G: { label: 'Jogo de garrafão', icon: '🏋️' },
    X: { label: 'Pontuador', icon: '🔥' },
    P: { label: 'Passe mágico', icon: '🪄' },
    R: { label: 'Reboteiro', icon: '🧲' },
    D: { label: 'Defesa / roubos', icon: '🛡️' },
    B: { label: 'Protetor de aro', icon: '✋' },
    C: { label: 'Decisivo', icon: '❄️' },
  };
  const TRAIT_WEIGHTS = [1, 0.6, 0.35]; // 1ª, 2ª e 3ª característica
  const TRAIT_BOOST = 12;               // pontos de atributo que a 1ª característica soma
  const MVP_BONUS = 7;                  // bônus extra do MVP da temporada na característica principal
  const FMVP_BONUS = 4.5;               // bônus do MVP das Finais (um pouco menor)
  // Tetos dos atributos: ninguém passa de 98. Só o atributo principal do MVP da temporada chega a 100,
  // e o do MVP das Finais a 99 (jogando na posição dele).
  const STAT_CAP = 98, MVP_TOP = 100, FMVP_TOP = 99;
  // em qual estatística o bônus de MVP aparece (para mostrar no card)
  const MVP_STAT = { S: 'Bola de 3', M: 'Meia distância', I: 'Infiltração', G: 'Jogo de garrafão', X: 'Pontuação', P: 'Passe', R: 'Rebote', D: 'Defesa', B: 'Proteção de aro', C: 'Decisão no fim do jogo' };
  // atributo(s) ligados a cada característica (o "atributo principal" de quem tem essa característica em 1º)
  const TRAIT_ATTR = { S: ['tres'], M: ['media'], I: ['infil'], G: ['post'], X: ['tres', 'media', 'infil'], P: ['passe'], R: ['reb'], D: ['defPer'], B: ['defAro'], C: ['clutch'] };
  function tw(p, letter) {
    const i = (p.tags || '').indexOf(letter);
    return i < 0 ? 0 : (TRAIT_WEIGHTS[i] || 0.25);
  }

  // ---------- posições ----------
  const POS_ORDER = ['PG', 'SG', 'SF', 'PF', 'C'];
  const POS_LABELS = { PG: 'Armador', SG: 'Ala-armador', SF: 'Ala', PF: 'Ala-pivô', C: 'Pivô' };
  const positionsOf = (p) => p.positions || [p.pos];
  // penalidade de overall por jogar numa posição que não é a de origem
  function posPenalty(p, slot) {
    const si = POS_ORDER.indexOf(slot);
    let d = 9;
    for (const ps of positionsOf(p)) d = Math.min(d, Math.abs(POS_ORDER.indexOf(ps) - si));
    const pen = [0, 8, 16, 24, 30][d];
    return pen === undefined ? 30 : pen;
  }
  const isGuard = (p) => positionsOf(p).some((x) => x === 'PG' || x === 'SG');
  const isBig = (p) => positionsOf(p).some((x) => x === 'PF' || x === 'C');

  // ---------- atributos (já com a penalidade de posição, se houver) ----------
  // Acima de 92 o atributo cresce mais devagar e para em 98: as estrelas continuam na frente, sem estourar a escala.
  // O que aparece no card é exatamente o que vale na simulação.
  const softCap = (v) => (v <= 92 ? v : Math.min(STAT_CAP, 92 + (v - 92) * 0.45));
  const ATTR_KEYS = ['tres', 'media', 'infil', 'post', 'passe', 'reb', 'defPer', 'defAro', 'clutch'];
  // atributo principal: o da 1ª característica (no Pontuador, o melhor entre 3, meia e infiltração)
  function mainAttr(p, a) {
    const ks = TRAIT_ATTR[(p.tags || '')[0]];
    if (!ks) return null;
    return ks.reduce((best, k) => (a[k] > a[best] ? k : best), ks[0]);
  }
  function rawAttrs(p, penalty) {
    const o = p.ovr - penalty, pos = p.pos;
    // MVP da temporada (ou, um pouco menos, das Finais): bônus extra na característica principal
    const star = p.mvp ? MVP_BONUS : p.fmvp ? FMVP_BONUS : 0;
    const mvpT = star ? (p.tags || '')[0] : null;
    const b = (l) => TRAIT_BOOST * tw(p, l) + (mvpT === l ? star : 0);
    const xs = mvpT === 'X' ? star * 0.6 : 0;
    const guard = pos === 'PG' || pos === 'SG';
    const raw = {
      tres: o - 9 + b('S') * 1.25 + xs + (pos === 'C' ? -10 : pos === 'PF' ? -4 : 0),
      media: o - 6 + b('M') * 1.2 + b('X') * 0.3 + xs,
      infil: o - 5 + b('I') * 1.2 + b('X') * 0.3 + xs + (pos === 'C' ? -4 : 0),
      post: o - 8 + b('G') * 1.3 + (pos === 'C' ? 8 : pos === 'PF' ? 5 : guard ? -10 : 0),
      passe: o - 7 + b('P') * 1.3 + (pos === 'PG' ? 4 : pos === 'C' ? -5 : 0),
      reb: o - 8 + b('R') * 1.3 + (pos === 'C' ? 7 : pos === 'PF' ? 4 : pos === 'PG' ? -6 : 0),
      defPer: o - 6 + b('D') * 1.25 + (pos === 'C' ? -6 : 0),
      defAro: o - 8 + b('B') * 1.3 + (pos === 'C' ? 7 : pos === 'PF' ? 3 : guard ? -10 : 0),
      clutch: o - 4 + b('C') * 1.2,
    };
    // cartas de reforço: pontos extras em atributos
    if (p.bonus) for (const k of ATTR_KEYS) raw[k] += p.bonus[k] || 0;
    return raw;
  }
  function attrs(p, penalty = 0) {
    const raw = rawAttrs(p, penalty);
    const out = {};
    for (const k of ATTR_KEYS) out[k] = Math.max(35, Math.round(softCap(raw[k])));
    // MVP: o atributo principal vai a 100 (MVP das Finais: 99), menos a penalidade se jogar fora de posição
    const top = p.mvp ? MVP_TOP : p.fmvp ? FMVP_TOP : 0;
    const mk = top ? mainAttr(p, raw) : null;
    if (mk) out[mk] = Math.max(out[mk], top - penalty);
    return out;
  }

  // ---------- cartas de reforço (leilão antes do leilão de jogadores) ----------
  // Cada técnico compra no máximo uma, com o mesmo dinheiro do leilão de jogadores, e depois do leilão
  // aplica em um único jogador do seu elenco. O reforço vale para o jogo todo (temporada e playoffs).
  const BOOSTS = {
    evolucao: { label: 'Evolução', icon: '⬆️', desc: '+3 de overall (até 99): todos os atributos do jogador sobem.' },
    fundamentos: { label: 'Treino de fundamentos', icon: '🏋️', desc: '+10 nos 2 atributos mais baixos do jogador (até 98).' },
    especialista: { label: 'Especialista', icon: '🎯', desc: '+12 no atributo principal (o da 1ª característica; Pontuador: +7 nos três arremessos) e +6 no da 2ª, até 98.' },
    versatil: { label: 'Versatilidade', icon: '🔄', desc: 'Ganha uma posição vizinha (ex.: PG vira PG/SG) e joga nela sem perder rendimento.', choose: 'pos' },
    dna: { label: 'Nova característica', icon: '🧬', desc: 'Ganha uma característica nova à sua escolha. Ela entra como a 2ª mais forte dele, com +8 no atributo dela (se ele já tinha 3, a 3ª sai).', choose: 'trait' },
  };
  const BOOST_KEYS = Object.keys(BOOSTS);
  // os 6 atributos que aparecem no card (garrafão e defesa juntam dois atributos cada)
  const CARD_ATTRS = { tres: ['tres'], media: ['media'], garrafao: ['infil', 'post'], passe: ['passe'], reb: ['reb'], def: ['defPer', 'defAro'] };
  const CARD_ATTR_LABEL = { tres: '3 Pts', media: 'Média', garrafao: 'Garrafão', passe: 'Passe', reb: 'Rebote', def: 'Defesa' };
  function cardAttrs(p, penalty = 0) {
    const a = attrs(p, penalty);
    return { tres: a.tres, media: a.media, garrafao: Math.max(a.infil, a.post), passe: a.passe, reb: a.reb, def: Math.max(a.defPer, a.defAro) };
  }
  // posições que a Versatilidade pode dar: vizinhas das que ele já joga
  function boostPositions(p) {
    const have = positionsOf(p);
    const out = new Set();
    for (const ps of have) {
      const i = POS_ORDER.indexOf(ps);
      for (const j of [i - 1, i + 1]) if (POS_ORDER[j] && !have.includes(POS_ORDER[j])) out.add(POS_ORDER[j]);
    }
    return POS_ORDER.filter((x) => out.has(x));
  }
  const boostTraits = (p) => Object.keys(TRAITS).filter((l) => !(p.tags || '').includes(l));
  // os 2 atributos mais baixos do card
  function lowestCardAttrs(p) {
    const a = cardAttrs(p);
    return Object.keys(a).sort((x, y) => a[x] - a[y]).slice(0, 2);
  }
  // devolve uma cópia do jogador com a carta aplicada (ou null se a escolha não vale para ele)
  function applyBoost(p, type, choice) {
    const q = { ...p, positions: positionsOf(p).slice(), bonus: { ...(p.bonus || {}) }, boost: { type, choice: choice || null } };
    const add = (k, v) => { q.bonus[k] = (q.bonus[k] || 0) + v; };
    const first = (p.tags || '')[0];
    if (type === 'evolucao') {
      if (p.ovr >= 99) return null;
      q.ovr = Math.min(99, p.ovr + 3);
    } else if (type === 'fundamentos') {
      const low = lowestCardAttrs(p);
      for (const g of low) for (const k of CARD_ATTRS[g]) add(k, 10);
      q.boost.choice = low.join(',');
    } else if (type === 'especialista') {
      if (!first || !TRAIT_ATTR[first]) return null;
      for (const k of TRAIT_ATTR[first]) add(k, first === 'X' ? 7 : 12);
      const second = (p.tags || '')[1];
      if (second && TRAIT_ATTR[second]) for (const k of TRAIT_ATTR[second]) add(k, second === 'X' ? 3 : 6);
    } else if (type === 'versatil') {
      if (!boostPositions(p).includes(choice)) return null;
      const all = q.positions.concat(choice).filter((x) => x !== p.pos).sort((x, y) => POS_ORDER.indexOf(x) - POS_ORDER.indexOf(y));
      q.positions = [p.pos, ...all]; // a posição principal continua a mesma (e o estilo de jogo também)
    } else if (type === 'dna') {
      if (!boostTraits(p).includes(choice)) return null;
      const t = p.tags || '';
      q.tags = t ? (t[0] + choice + t.slice(1)).slice(0, 3) : choice; // entra como 2ª característica
      for (const k of TRAIT_ATTR[choice]) add(k, choice === 'X' ? 4 : 8);
    } else return null;
    return q;
  }

  // ---------- esquemas (sistema de jogo) ----------
  // O bônus cresce com os jogadores em quadra que têm as características do esquema.
  // Sem nenhum jogador que encaixe, o esquema funciona igual ao "Equilibrado": sem bônus e sem ônus.
  const SCHEMES = {
    equilibrado: { label: 'Equilibrado', desc: 'Sem foco especial.', traits: {} },
    tres: { label: 'Chuva de 3', desc: 'Mais e melhores bolas de 3.', traits: { S: 1 } },
    garrafao: { label: 'Garrafão', desc: 'Jogo de costas, infiltração e rebote ofensivo.', traits: { G: 1, I: 0.8, R: 0.5 } },
    showtime: { label: 'Showtime', desc: 'Contra-ataque, menos erros e cestas fáceis.', traits: { P: 1, I: 0.6, D: 0.5 } },
    estrela: { label: 'Isolação', desc: 'A bola na mão dos pontuadores e decisivos.', traits: { X: 1, M: 0.8, C: 0.6 } },
  };
  const DEF_SCHEMES = {
    individual: { label: 'Individual', desc: 'Marcação padrão.', traits: {} },
    zona: { label: 'Zona', desc: 'Fecha o garrafão, mas libera a bola de 3. Protetores de aro e reboteiros rendem mais.', traits: { B: 1, R: 0.5 } },
    pressao: { label: 'Pressão', desc: 'Força erros, mas comete mais faltas. Defensores de perímetro rendem mais.', traits: { D: 1 } },
  };
  const FIT_FULL = 2.4; // soma de encaixe para bônus máximo (ex.: 2 especialistas + 1 secundário)
  function schemeFit(def, players) {
    let score = 0;
    const who = [];
    for (const p of players) {
      let best = 0;
      for (const [l, w] of Object.entries(def.traits)) best = Math.max(best, tw(p, l) * w);
      if (best > 0) { score += best; who.push(p.id); }
    }
    return { fit: Math.min(1, score / FIT_FULL), who };
  }
  function schemeBonusText(key, fit) {
    const pct = (v) => '+' + (Math.round(v * 1000) / 10).toString().replace('.', ',') + '%';
    if (!fit) return 'Sem encaixe: nenhum bônus e nenhum ônus';
    switch (key) {
      case 'tres': return `${pct(0.035 * fit)} nos arremessos de 3 e mais chutes de longe`;
      case 'garrafao': return `${pct(0.03 * fit)} no garrafão e ${pct(0.04 * fit)} em rebote ofensivo`;
      case 'showtime': return `${pct(0.03 * fit)} menos erros e ${pct(0.03 * fit)} nas bandejas`;
      case 'estrela': return `${pct(0.05 * fit)} nos arremessos das estrelas, que ficam mais com a bola`;
      case 'zona': return `aro mais protegido (${pct(0.03 * fit)} de erro adversário)`;
      case 'pressao': return `${pct(0.03 * fit)} de roubos de bola`;
      default: return '';
    }
  }

  // ---------- escalação automática ----------
  // escolhe os 5 titulares e as posições que maximizam o overall efetivo
  function autoLineup(players) {
    const ps = players.slice().sort((a, b) => b.ovr - a.ovr);
    const cand = ps.slice(0, Math.min(ps.length, 9));
    let best = null, bestScore = -1e9;
    const slots = POS_ORDER;
    const used = new Array(cand.length).fill(false);
    const pick = [];
    (function rec(si, score) {
      if (si === 5) { if (score > bestScore) { bestScore = score; best = pick.slice(); } return; }
      for (let i = 0; i < cand.length; i++) {
        if (used[i]) continue;
        used[i] = true; pick.push(i);
        rec(si + 1, score + cand[i].ovr - posPenalty(cand[i], slots[si]));
        used[i] = false; pick.pop();
      }
    })(0, 0);
    const lu = {};
    if (!best) { slots.forEach((s, i) => { lu[s] = ps[i] ? ps[i].id : null; }); }
    else slots.forEach((s, i) => { lu[s] = cand[best[i]].id; });
    const starters = new Set(Object.values(lu));
    lu.bench = ps.filter((p) => !starters.has(p.id)).map((p) => p.id);
    return lu;
  }

  // ---------- leilão: proporção de jogadores ofertados ----------
  // 60% a mais de jogadores do que vagas, arredondado para múltiplo de 5 (mesma quantidade por posição)
  const OFFER_RATIO = 1.6;
  const lotsFor = (slots) => Math.ceil((slots * OFFER_RATIO) / 5) * 5;
  // Lendas da franquia: sem disputa, preço fixo e menos dinheiro
  const FRANCHISE_BUDGET = { 5: 60, 8: 75, 10: 85 };
  function tablePrice(p) {
    const o = p.ovr;
    const base = o >= 98 ? 24 : o >= 96 ? 20 : o >= 94 ? 16 : o >= 92 ? 13 : o >= 90 ? 10 : o >= 88 ? 8 : o >= 86 ? 6 : o >= 84 ? 4 : o >= 82 ? 3 : o >= 80 ? 2 : 1;
    return base + (p.mvp ? 2 : p.fmvp ? 1 : 0);
  }

  const DATA = {
    OFFER_RATIO, lotsFor, FRANCHISE_BUDGET, tablePrice,
    TEAMS, OLD_TEAMS, FRANCHISE_OF, franchiseOf, EAST, confOf, CONF_LABEL, baseId, CARDS, CARD_AUTO, ARENAS, ARENA_TIERS, arenaText, arenaTeamColors, PLAYERS, POOLS, POOL_INFO, MVPS, FMVPS, MVP_BONUS, FMVP_BONUS, MVP_STAT, STAT_CAP, MVP_TOP, FMVP_TOP, mainAttr,
    BOOSTS, BOOST_KEYS, CARD_ATTRS, CARD_ATTR_LABEL, cardAttrs, boostPositions, boostTraits, lowestCardAttrs, applyBoost, CURRENT_SEASON, identity, TRAITS, TRAIT_WEIGHTS, tw, POS_ORDER, POS_LABELS,
    positionsOf, posPenalty, isGuard, isBig, attrs, SCHEMES, DEF_SCHEMES, schemeFit, schemeBonusText, autoLineup,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
  else root.DATA = DATA;
})(typeof window !== 'undefined' ? window : this);
