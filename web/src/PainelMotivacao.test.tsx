import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PainelMotivacao } from './PainelMotivacao';

describe('painel motivacional', () => {
  it('mostra a marca MB Gestão e os cinco blocos sem alterar o menu', () => {
    render(<PainelMotivacao />);
    expect(screen.getByLabelText('Mensagens MB Gestão')).toBeTruthy();
    expect(screen.getByText('MB Gestão')).toBeTruthy();
    expect(screen.getByText('FOCO')).toBeTruthy();
    expect(screen.getByText('Tenha clareza do seu objetivo. Trabalhe todos os dias.')).toBeTruthy();
    expect(screen.getByText('DISCIPLINA')).toBeTruthy();
    expect(screen.getByText('PERSISTÊNCIA')).toBeTruthy();
    expect(screen.getByText('MOTIVAÇÃO')).toBeTruthy();
    expect(screen.getByText('SUPERAÇÃO')).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});
