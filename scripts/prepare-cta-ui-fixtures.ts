import {writeFileSync} from 'node:fs';
import {longUserCommand} from './cta-real-command-cases';
writeFileSync('.runtime/cta-audit-real/ui-fixtures.json',JSON.stringify({message:longUserCommand(99000),training:longUserCommand(120000)+'\nExemplo positivo: "Uma ajuda para a rotina da casa".\nExemplo negativo: "Corre, estoque vai acabar!".'}));
