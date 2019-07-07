function noise = perlin_noise(samples, gradients, octave_decay_factor)

if ( isempty(gradients) )
  noise = [];
  return;
end

if ( nargin < 3 )
  octave_decay_factor = 0.5;
else
  validateattributes( octave_decay_factor, {'double', 'single'}, {'scalar'} ...
    , mfilename, 'octave_decay_factor' );
end

% For each dimension:
%   * Find each pair of indices [0, 1] for which the *other* dimensions are 
%     held constant.
%   * Interpolate between those pairs.
%   * Interpolate between *those* pairs, 

try
  check_inputs( samples, gradients );
catch err
  throw( err );
end

samples(samples < 0) = 0;
samples(samples > 1) = 1;

num_dims = size( samples, 1 );
num_samples = size( samples, 2 );
num_octaves = numel( gradients );

num_adjacent_gradients = 2^num_dims;
adjacent_distances = zeros( 1, num_adjacent_gradients );

combination_indices = grid_indices_combinations( num_dims );

noise = zeros( 1, num_samples );
octave_decay = 1;

for i = 1:num_samples
  for j = 1:num_octaves
    curr_gradient = gradients{j};
    num_gradient_samples = size( curr_gradient, 2 );
    
    grid_relative_sample = samples(:, i) .* num_gradient_samples;
    grid_point = floor( grid_relative_sample );
    t = grid_relative_sample - grid_point;
    sample_point = grid_point + 1;
    
    adjacent_distances(:) = 0;
    
    for k = 1:num_adjacent_gradients
      adjacent_inds = combination_indices(:, k);
      sample_indices = sample_point + adjacent_inds;
      
      % wraparound
      sample_indices = mod( sample_indices-1, num_gradient_samples ) + 1;
      
      is_next = logical( adjacent_inds );
      sample_ts = t;
      sample_ts(is_next) = t(is_next)-1;
      
      for h = 1:num_dims        
        gradient_sample = curr_gradient(h, sample_indices(h)) * sample_ts(h);
        adjacent_distances(k) = adjacent_distances(k) + gradient_sample;
      end
    end
    
    t0s = default_smooth( 1-t );
    t1s = default_smooth( t );
    
    for k = 1:num_dims
      combs = grid_indices_combinations( num_dims-k );
      [num_remaining_dims, num_combs] = size( combs );
      
      for h = 1:num_combs
        ind0 = true( 1, num_adjacent_gradients );
        ind1 = true( 1, num_adjacent_gradients );
        
        for hh = 1:num_remaining_dims-1
          remaining_ind = combination_indices(k+hh, :) == combs(hh, h);
          
          ind0 = ind0 & remaining_ind;
          ind1 = ind1 & remaining_ind;
        end
        
        grad0 = adjacent_distances(ind0);
        grad1 = adjacent_distances(ind1);
        
        combined = grad0*t0s(k) + grad1*t1s(k);
      end
    end

    if ( num_dims == 1 )
      x0 = combination_indices(1, :) == 0;
      x1 = combination_indices(1, :) == 1;

      grad_x00 = adjacent_distances(x0);
      grad_x10 = adjacent_distances(x1);
      noise_result = grad_x00*t0s(1) + grad_x10*t1s(1);
      
    elseif ( num_dims == 2 )
      
    else
      x0 = combination_indices(1, :) == 0;
      x1 = combination_indices(1, :) == 1;
      y0 = combination_indices(2, :) == 0;
      y1 = combination_indices(2, :) == 1;
      z0 = combination_indices(3, :) == 0;
      z1 = combination_indices(3, :) == 1;
    
      x000 = x0 & y0 & z0;
      x100 = x1 & y0 & z0;
      x010 = x0 & y1 & z0;
      x110 = x1 & y1 & z0;
      x001 = x1 & y0 & z1;
      x101 = x1 & y0 & z1;
      
      grad_x000 = adjacent_distances(x000);
      grad_x100 = adjacent_distances(x100);
      grad_x010 = adjacent_distances(x010);
      grad_x110 = adjacent_distances(x110);
      
      grad_x101 = adjacent_distances(x101);
      
      nx0 = grad_x000*tx0 + grad_x100*tx1;
      nx1 = grad_x010*tx0 + grad_x110*tx1;
      
      nx2 = grad_x001*tx0 + grad_x101*tx1;
    end
    
    noise(i) = noise(i) + noise_result * octave_decay;
    octave_decay = octave_decay * octave_decay_factor;
  end
end

end

function t = default_smooth(t)
% http://staffwww.itn.liu.se/~stegu/simplexnoise/simplexnoise.pdf
t = 6.*t.^5 - 15.*t.^4 + 10.*t.^3;
end

function c = grid_indices_combinations(num_dims)

% https://www.mathworks.com/matlabcentral/answers/412412-how-to-create-matrix-of-all-combinations

c = repmat( {[0, 1]}, 1, num_dims );
[c{:}] = ndgrid(c{:});
n = length(c);
c = reshape(cat(n+1, c{:}), [], n)';

end

function check_inputs(samples, gradients)

validateattributes( gradients, {'cell'}, {'vector'}, mfilename, 'gradients' );
validateattributes( samples, {'double', 'single'}, {'2d', 'nrows', size(gradients{1}, 1)} ...
  , mfilename, 'samples' );

end